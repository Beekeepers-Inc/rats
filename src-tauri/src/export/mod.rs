use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::State;
use crate::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportResult {
    pub success: bool,
    pub message: String,
    pub file_path: String,
    pub rows_exported: usize,
}

#[derive(Debug, thiserror::Error)]
pub enum ExportError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("DuckDB error: {0}")]
    DuckDB(#[from] duckdb::Error),

    #[error("Excel error: {0}")]
    Excel(String),

    #[error("{0}")]
    Custom(String),
}

/// Export table to CSV
#[tauri::command(rename_all = "camelCase")]
pub async fn export_to_csv(
    state: State<'_, AppState>,
    table_name: String,
    file_path: String,
    include_header: Option<bool>,
) -> Result<ExportResult, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection();

    let path = PathBuf::from(&file_path);
    let include_header = include_header.unwrap_or(true);

    // Use DuckDB's COPY TO for efficient CSV export
    let header_option = if include_header { "HEADER" } else { "" };

    let copy_query = format!(
        "COPY {} TO '{}' (FORMAT CSV, {})",
        table_name,
        path.to_str().ok_or("Invalid path")?,
        header_option
    );

    conn.execute(&copy_query, [])
        .map_err(|e| format!("Export error: {}", e))?;

    // Get row count
    let count_query = format!("SELECT COUNT(*) FROM {}", table_name);
    let rows_exported: usize = conn
        .query_row(&count_query, [], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    Ok(ExportResult {
        success: true,
        message: format!("Successfully exported {} rows to CSV", rows_exported),
        file_path: file_path.clone(),
        rows_exported,
    })
}

/// Export table to Excel
#[tauri::command(rename_all = "camelCase")]
pub async fn export_to_excel(
    state: State<'_, AppState>,
    table_name: String,
    file_path: String,
    sheet_name: Option<String>,
) -> Result<ExportResult, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let sheet_name = sheet_name.unwrap_or_else(|| "Data".to_string());

    // Query all data
    let query = format!("SELECT * FROM {}", table_name);
    let result = db.execute_query(&query)
        .map_err(|e| format!("Query error: {}", e))?;

    // Create Excel workbook
    let workbook = xlsxwriter::Workbook::new(&file_path)
        .map_err(|e| format!("Failed to create workbook: {}", e))?;

    let mut worksheet = workbook.add_worksheet(Some(&sheet_name))
        .map_err(|e| format!("Failed to add worksheet: {}", e))?;

    // Write headers
    for (col_idx, col_name) in result.columns.iter().enumerate() {
        worksheet
            .write_string(0, col_idx as u16, col_name, None)
            .map_err(|e| format!("Failed to write header: {}", e))?;
    }

    // Write data rows
    for (row_idx, row_data) in result.rows.iter().enumerate() {
        for (col_idx, cell_value) in row_data.iter().enumerate() {
            let excel_row = (row_idx + 1) as u32;
            let excel_col = col_idx as u16;

            match cell_value {
                serde_json::Value::Null => {
                    worksheet.write_blank(excel_row, excel_col, None)
                        .map_err(|e| format!("Failed to write cell: {}", e))?;
                }
                serde_json::Value::Bool(b) => {
                    worksheet.write_boolean(excel_row, excel_col, *b, None)
                        .map_err(|e| format!("Failed to write cell: {}", e))?;
                }
                serde_json::Value::Number(n) => {
                    if let Some(f) = n.as_f64() {
                        worksheet.write_number(excel_row, excel_col, f, None)
                            .map_err(|e| format!("Failed to write cell: {}", e))?;
                    } else if let Some(i) = n.as_i64() {
                        worksheet.write_number(excel_row, excel_col, i as f64, None)
                            .map_err(|e| format!("Failed to write cell: {}", e))?;
                    }
                }
                serde_json::Value::String(s) => {
                    worksheet.write_string(excel_row, excel_col, s, None)
                        .map_err(|e| format!("Failed to write cell: {}", e))?;
                }
                _ => {
                    worksheet.write_string(excel_row, excel_col, &cell_value.to_string(), None)
                        .map_err(|e| format!("Failed to write cell: {}", e))?;
                }
            }
        }
    }

    workbook.close()
        .map_err(|e| format!("Failed to save workbook: {}", e))?;

    Ok(ExportResult {
        success: true,
        message: format!("Successfully exported {} rows to Excel", result.total_rows),
        file_path,
        rows_exported: result.total_rows,
    })
}

/// Export query results to CSV
#[tauri::command(rename_all = "camelCase")]
pub async fn export_query_to_csv(
    state: State<'_, AppState>,
    query: String,
    file_path: String,
    include_header: Option<bool>,
) -> Result<ExportResult, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection();

    let path = PathBuf::from(&file_path);
    let include_header = include_header.unwrap_or(true);

    // Use DuckDB's COPY TO with query
    let header_option = if include_header { "HEADER" } else { "" };

    let copy_query = format!(
        "COPY ({}) TO '{}' (FORMAT CSV, {})",
        query,
        path.to_str().ok_or("Invalid path")?,
        header_option
    );

    conn.execute(&copy_query, [])
        .map_err(|e| format!("Export error: {}", e))?;

    // Get result count
    let count_query = format!("SELECT COUNT(*) FROM ({})", query);
    let rows_exported: usize = conn
        .query_row(&count_query, [], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    Ok(ExportResult {
        success: true,
        message: format!("Successfully exported {} rows to CSV", rows_exported),
        file_path: file_path.clone(),
        rows_exported,
    })
}
