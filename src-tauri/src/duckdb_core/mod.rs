use duckdb::{Connection, Result as DuckResult};
use serde::{Deserialize, Serialize};
use tauri::State;
use crate::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColumnInfo {
    pub name: String,
    pub data_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableInfo {
    pub columns: Vec<ColumnInfo>,
    pub row_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<serde_json::Value>>,
    pub total_rows: usize,
}

pub struct DatabaseConnection {
    conn: Connection,
}

impl DatabaseConnection {
    pub fn new() -> DuckResult<Self> {
        let conn = Connection::open_in_memory()?;

        // Configure DuckDB for performance
        conn.execute_batch(
            "SET memory_limit='4GB';
             SET threads=4;"
        )?;

        Ok(Self { conn })
    }

    pub fn get_connection(&self) -> &Connection {
        &self.conn
    }

    pub fn execute_query(&self, query: &str) -> DuckResult<QueryResult> {
        // First, get column information using DESCRIBE
        let describe_query = format!("DESCRIBE {}", query);
        let mut describe_stmt = self.conn.prepare(&describe_query)?;
        let mut describe_rows = describe_stmt.query([])?;

        let mut columns = Vec::new();
        while let Some(row) = describe_rows.next()? {
            let col_name: String = row.get(0)?;
            columns.push(col_name);
        }

        let column_count = columns.len();

        // Now execute the actual data query
        let mut stmt = self.conn.prepare(query)?;
        let mut rows_result = stmt.query([])?;
        let mut collected_rows = Vec::new();

        while let Some(row) = rows_result.next()? {
            let mut row_data = Vec::new();
            for i in 0..column_count {
                let value: serde_json::Value = match row.get_ref(i)? {
                    duckdb::types::ValueRef::Null => serde_json::Value::Null,
                    duckdb::types::ValueRef::Boolean(b) => serde_json::Value::Bool(b),
                    duckdb::types::ValueRef::TinyInt(i) => serde_json::Value::Number(i.into()),
                    duckdb::types::ValueRef::SmallInt(i) => serde_json::Value::Number(i.into()),
                    duckdb::types::ValueRef::Int(i) => serde_json::Value::Number(i.into()),
                    duckdb::types::ValueRef::BigInt(i) => serde_json::Value::Number(i.into()),
                    duckdb::types::ValueRef::Float(f) => {
                        serde_json::Number::from_f64(f as f64)
                            .map(serde_json::Value::Number)
                            .unwrap_or(serde_json::Value::Null)
                    },
                    duckdb::types::ValueRef::Double(f) => {
                        serde_json::Number::from_f64(f)
                            .map(serde_json::Value::Number)
                            .unwrap_or(serde_json::Value::Null)
                    },
                    duckdb::types::ValueRef::Text(s) => {
                        serde_json::Value::String(String::from_utf8_lossy(s).to_string())
                    },
                    _ => serde_json::Value::String(format!("{:?}", row.get_ref(i)?)),
                };
                row_data.push(value);
            }
            collected_rows.push(row_data);
        }

        let total_rows = collected_rows.len();

        Ok(QueryResult {
            columns,
            rows: collected_rows,
            total_rows,
        })
    }

    pub fn get_table_info_internal(&self, table_name: &str) -> DuckResult<TableInfo> {
        // Get column information
        let query = format!("PRAGMA table_info('{}')", table_name);
        let mut stmt = self.conn.prepare(&query)?;

        let mut columns = Vec::new();
        let rows = stmt.query_map([], |row| {
            Ok(ColumnInfo {
                name: row.get(1)?,
                data_type: row.get(2)?,
            })
        })?;

        for row in rows {
            columns.push(row?);
        }

        // Get row count
        let count_query = format!("SELECT COUNT(*) FROM {}", table_name);
        let row_count: usize = self.conn.query_row(&count_query, [], |row| row.get(0))?;

        Ok(TableInfo { columns, row_count })
    }
}

#[tauri::command(rename_all = "camelCase")]
pub async fn query_data(
    state: State<'_, AppState>,
    table_name: String,
    limit: Option<usize>,
    offset: Option<usize>,
) -> Result<QueryResult, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let limit = limit.unwrap_or(1000);
    let offset = offset.unwrap_or(0);

    let query = format!("SELECT * FROM {} LIMIT {} OFFSET {}", table_name, limit, offset);

    db.execute_query(&query)
        .map_err(|e| format!("Query error: {}", e))
}

#[tauri::command(rename_all = "camelCase")]
pub async fn get_table_info(
    state: State<'_, AppState>,
    table_name: String,
) -> Result<TableInfo, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    db.get_table_info_internal(&table_name)
        .map_err(|e| format!("Failed to get table info: {}", e))
}
