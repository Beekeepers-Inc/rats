use calamine::{open_workbook, Reader, Xlsx};
use csv::ReaderBuilder;
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::BufReader;
use std::path::PathBuf;
use tauri::{Emitter, State};
use crate::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResult {
    pub success: bool,
    pub message: String,
    pub table_name: String,
    pub rows_imported: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreviewData {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<String>>,
    pub total_rows: usize,
}

#[derive(Debug, thiserror::Error)]
pub enum ImportError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("CSV error: {0}")]
    Csv(#[from] csv::Error),
    #[error("Excel error: {0}")]
    Excel(#[from] calamine::Error),
    #[error("DuckDB error: {0}")]
    DuckDB(#[from] duckdb::Error),
    #[error("Unsupported file format")]
    UnsupportedFormat,
    #[error("{0}")]
    Custom(String),
}

fn detect_file_format(path: &PathBuf) -> Result<String, ImportError> {
    let extension = path
        .extension()
        .and_then(|s| s.to_str())
        .ok_or(ImportError::UnsupportedFormat)?
        .to_lowercase();

    match extension.as_str() {
        "csv" => Ok("csv".to_string()),
        "xlsx" | "xlsm" | "xlsb" | "xls" => Ok("excel".to_string()),
        _ => Err(ImportError::UnsupportedFormat),
    }
}

fn sanitize_table_name(name: &str) -> String {
    name.chars()
        .map(|c| if c.is_alphanumeric() || c == '_' { c } else { '_' })
        .collect::<String>()
        .trim_matches('_')
        .to_string()
}

// Let DuckDB handle CSV import with schema inference
fn import_csv_with_duckdb(
    path: &PathBuf,
    table_name: &str,
    db_conn: &duckdb::Connection,
    window: tauri::Window,
) -> Result<usize, ImportError> {
    let path_str = path.to_str().ok_or_else(|| {
        ImportError::Custom("Invalid file path".to_string())
    })?;

    println!("Starting CSV import from: {}", path_str);
    println!("Target table: {}", table_name);

    let _ = window.emit("import-progress", ImportProgress {
        rows_imported: 0,
        total_rows: None,
        status: "Starting CSV import...".to_string(),
    });

    // Use DuckDB's simple recommended approach - it auto-detects everything
    // https://duckdb.org/docs/stable/data/csv/overview
    let query = format!("CREATE TABLE {} AS FROM '{}'", table_name, path_str);

    println!("Executing query: {}", query);

    // Execute import - DuckDB handles schema detection, types, parallel loading automatically
    match db_conn.execute(&query, []) {
        Ok(_) => println!("Import query executed successfully"),
        Err(e) => {
            println!("Import query failed: {:?}", e);
            return Err(ImportError::DuckDB(e));
        }
    }

    // Get row count using DuckDB's efficient count
    let count_query = format!("SELECT COUNT(*) FROM {}", table_name);
    let row_count: usize = match db_conn.query_row(&count_query, [], |row| row.get(0)) {
        Ok(count) => {
            println!("CSV import completed: {} rows", count);
            count
        },
        Err(e) => {
            println!("Failed to count rows: {:?}", e);
            return Err(ImportError::DuckDB(e));
        }
    };

    let _ = window.emit("import-progress", ImportProgress {
        rows_imported: row_count,
        total_rows: Some(row_count),
        status: "Import complete!".to_string(),
    });

    Ok(row_count)
}

// For Excel, we still need to handle it manually but create proper typed table
fn import_excel_with_duckdb(
    path: &PathBuf,
    table_name: &str,
    db_conn: &duckdb::Connection,
    window: tauri::Window,
) -> Result<usize, ImportError> {
    let mut workbook: Xlsx<_> = open_workbook(path)
        .map_err(|e| ImportError::Custom(format!("Excel error: {}", e)))?;

    let sheet_names = workbook.sheet_names().to_owned();
    if sheet_names.is_empty() {
        return Err(ImportError::Custom("No sheets found in Excel file".to_string()));
    }

    let range = workbook
        .worksheet_range(&sheet_names[0])
        .map_err(|_| ImportError::Custom("Failed to read sheet".to_string()))?;

    let mut all_rows = range.rows();

    // Get headers
    let headers: Vec<String> = if let Some(header_row) = all_rows.next() {
        header_row
            .iter()
            .enumerate()
            .map(|(i, cell)| {
                let header = cell.to_string().trim().to_string();
                if header.is_empty() {
                    format!("Column{}", i + 1)
                } else {
                    sanitize_table_name(&header)
                }
            })
            .collect()
    } else {
        return Err(ImportError::Custom("Empty Excel file".to_string()));
    };

    // Create table with VARCHAR columns (DuckDB will optimize types)
    let columns_def: Vec<String> = headers
        .iter()
        .map(|h| format!("\"{}\" VARCHAR", h))
        .collect();

    let create_table_query = format!(
        "CREATE TABLE {} ({})",
        table_name,
        columns_def.join(", ")
    );

    db_conn.execute(&create_table_query, [])?;

    // Start transaction for better performance
    db_conn.execute("BEGIN TRANSACTION", [])?;

    // Prepare INSERT statement
    let placeholders = vec!["?"; headers.len()].join(", ");
    let insert_query = format!("INSERT INTO {} VALUES ({})", table_name, placeholders);

    let mut total_rows = 0;
    let mut batch_count = 0;
    const BATCH_SIZE: usize = 1000;

    for row in all_rows {
        let cell_strings: Vec<String> = row
            .iter()
            .map(|cell| {
                let s = cell.to_string();
                if s.is_empty() {
                    String::new()
                } else {
                    s
                }
            })
            .collect();

        let values: Vec<&dyn duckdb::ToSql> = cell_strings
            .iter()
            .map(|s| {
                if s.is_empty() {
                    &duckdb::types::Null as &dyn duckdb::ToSql
                } else {
                    s as &dyn duckdb::ToSql
                }
            })
            .collect();

        db_conn.execute(&insert_query, duckdb::params_from_iter(values.iter()))?;
        total_rows += 1;
        batch_count += 1;

        // Emit progress every 1000 rows
        if batch_count >= BATCH_SIZE {
            let _ = window.emit("import-progress", ImportProgress {
                rows_imported: total_rows,
                total_rows: None,
                status: format!("Importing... {} rows", total_rows),
            });
            batch_count = 0;
        }
    }

    // Commit transaction
    db_conn.execute("COMMIT", [])?;

    let _ = window.emit("import-progress", ImportProgress {
        rows_imported: total_rows,
        total_rows: Some(total_rows),
        status: "Finalizing import...".to_string(),
    });

    Ok(total_rows)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportProgress {
    pub rows_imported: usize,
    pub total_rows: Option<usize>,
    pub status: String,
}

#[tauri::command(rename_all = "camelCase")]
pub async fn import_file(
    state: State<'_, AppState>,
    window: tauri::Window,
    file_path: String,
    table_name: Option<String>,
) -> Result<ImportResult, String> {
    let path = PathBuf::from(&file_path);
    let format = detect_file_format(&path).map_err(|e| e.to_string())?;

    let table_name = table_name.unwrap_or_else(|| {
        path.file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("imported_data")
            .to_string()
    });

    let sanitized_table_name = sanitize_table_name(&table_name);

    // Emit start event with clearer messaging
    let _ = window.emit("import-progress", ImportProgress {
        rows_imported: 0,
        total_rows: None,
        status: "Starting import... Large files may take 1-2 minutes".to_string(),
    });

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection();

    // Drop table if exists
    let _ = conn.execute(&format!("DROP TABLE IF EXISTS {}", sanitized_table_name), []);

    // Perform import (Tauri's async runtime keeps this from blocking UI)
    let rows_imported = match format.as_str() {
        "csv" => import_csv_with_duckdb(&path, &sanitized_table_name, conn, window.clone()),
        "excel" => import_excel_with_duckdb(&path, &sanitized_table_name, conn, window.clone()),
        _ => Err(ImportError::UnsupportedFormat),
    }
    .map_err(|e| e.to_string())?;

    // Emit completion event
    let _ = window.emit("import-progress", ImportProgress {
        rows_imported,
        total_rows: Some(rows_imported),
        status: "Import complete!".to_string(),
    });

    Ok(ImportResult {
        success: true,
        message: format!("Successfully imported {} rows", rows_imported),
        table_name: sanitized_table_name,
        rows_imported,
    })
}

#[tauri::command(rename_all = "camelCase")]
pub async fn preview_file(
    file_path: String,
    rows: Option<usize>,
) -> Result<PreviewData, String> {
    let path = PathBuf::from(&file_path);
    let format = detect_file_format(&path).map_err(|e| e.to_string())?;
    let preview_rows = rows.unwrap_or(10);

    match format.as_str() {
        "csv" => preview_csv(&path, preview_rows),
        "excel" => preview_excel(&path, preview_rows),
        _ => Err("Unsupported format".to_string()),
    }
}

fn preview_csv(path: &PathBuf, rows: usize) -> Result<PreviewData, String> {
    let file = File::open(path).map_err(|e| e.to_string())?;
    let buf_reader = BufReader::new(file);
    let mut rdr = ReaderBuilder::new().from_reader(buf_reader);

    let headers: Vec<String> = rdr
        .headers()
        .map_err(|e| e.to_string())?
        .iter()
        .map(|h| h.to_string())
        .collect();

    let mut preview_rows = Vec::new();
    let mut total_rows = 0;

    for result in rdr.records() {
        total_rows += 1;
        if preview_rows.len() < rows {
            let record = result.map_err(|e| e.to_string())?;
            let row: Vec<String> = record.iter().map(|f| f.to_string()).collect();
            preview_rows.push(row);
        }
    }

    Ok(PreviewData {
        columns: headers,
        rows: preview_rows,
        total_rows,
    })
}

fn preview_excel(path: &PathBuf, rows: usize) -> Result<PreviewData, String> {
    let mut workbook: Xlsx<_> = open_workbook(path)
        .map_err(|e| format!("Excel error: {}", e))?;

    let sheet_names = workbook.sheet_names().to_owned();
    if sheet_names.is_empty() {
        return Err("No sheets found".to_string());
    }

    let range = workbook
        .worksheet_range(&sheet_names[0])
        .map_err(|e| e.to_string())?;

    let mut all_rows = range.rows();

    let headers: Vec<String> = if let Some(header_row) = all_rows.next() {
        header_row.iter().map(|c| c.to_string()).collect()
    } else {
        return Err("Empty sheet".to_string());
    };

    let mut preview_rows = Vec::new();
    let mut total_rows = 0;

    for row in all_rows {
        total_rows += 1;
        if preview_rows.len() < rows {
            let row_data: Vec<String> = row.iter().map(|c| c.to_string()).collect();
            preview_rows.push(row_data);
        }
    }

    Ok(PreviewData {
        columns: headers,
        rows: preview_rows,
        total_rows,
    })
}
