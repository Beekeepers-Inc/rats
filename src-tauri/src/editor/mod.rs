use serde::{Deserialize, Serialize};
use tauri::State;
use crate::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReorderResult {
    pub success: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SortColumn {
    pub column: String,
    pub ascending: bool,
}

#[tauri::command(rename_all = "camelCase")]
pub async fn reorder_rows(
    state: State<'_, AppState>,
    table_name: String,
    sort_columns: Vec<SortColumn>,
) -> Result<ReorderResult, String> {
    if sort_columns.is_empty() {
        return Err("No sort columns specified".to_string());
    }

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection();

    // Build ORDER BY clause
    let order_by_parts: Vec<String> = sort_columns
        .iter()
        .map(|sc| {
            let direction = if sc.ascending { "ASC" } else { "DESC" };
            format!("\"{}\" {}", sc.column, direction)
        })
        .collect();

    let order_by_clause = order_by_parts.join(", ");

    // Create a new table with sorted data using DuckDB
    let temp_table = format!("{}_sorted_temp", table_name);

    // Drop temp table if exists
    let _ = conn.execute(&format!("DROP TABLE IF EXISTS {}", temp_table), []);

    // Create sorted temp table
    let create_query = format!(
        "CREATE TABLE {} AS SELECT * FROM {} ORDER BY {}",
        temp_table, table_name, order_by_clause
    );
    conn.execute(&create_query, [])
        .map_err(|e| format!("Failed to create sorted table: {}", e))?;

    // Drop original table
    conn.execute(&format!("DROP TABLE {}", table_name), [])
        .map_err(|e| format!("Failed to drop original table: {}", e))?;

    // Rename temp table to original name
    conn.execute(
        &format!("ALTER TABLE {} RENAME TO {}", temp_table, table_name),
        [],
    )
    .map_err(|e| format!("Failed to rename table: {}", e))?;

    Ok(ReorderResult {
        success: true,
        message: format!("Rows reordered by {} column(s)", sort_columns.len()),
    })
}
