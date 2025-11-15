use serde::{Deserialize, Serialize};
use tauri::State;
use crate::AppState;
use duckdb::Result as DuckResult;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColumnStatistics {
    pub column_name: String,
    pub count: i64,
    pub null_count: i64,
    pub distinct_count: i64,
    pub min: Option<serde_json::Value>,
    pub max: Option<serde_json::Value>,
    pub mean: Option<f64>,
    pub median: Option<f64>,
    pub std_dev: Option<f64>,
    pub variance: Option<f64>,
    pub q25: Option<f64>,  // 25th percentile
    pub q75: Option<f64>,  // 75th percentile
    pub data_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableStatistics {
    pub table_name: String,
    pub total_rows: i64,
    pub total_columns: usize,
    pub column_stats: Vec<ColumnStatistics>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AggregationResult {
    pub column_name: String,
    pub function: String,
    pub result: serde_json::Value,
}

/// Get comprehensive statistics for a table
#[tauri::command(rename_all = "camelCase")]
pub async fn get_table_statistics(
    state: State<'_, AppState>,
    table_name: String,
) -> Result<TableStatistics, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection();

    // Get total row count
    let count_query = format!("SELECT COUNT(*) FROM {}", table_name);
    let total_rows: i64 = conn
        .query_row(&count_query, [], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    // Get column information
    let describe_query = format!("DESCRIBE {}", table_name);
    let mut stmt = conn.prepare(&describe_query).map_err(|e| e.to_string())?;
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;

    let mut column_stats = Vec::new();

    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let column_name: String = row.get(0).map_err(|e| e.to_string())?;
        let data_type: String = row.get(1).map_err(|e| e.to_string())?;

        let stats = calculate_column_statistics(
            conn,
            &table_name,
            &column_name,
            &data_type,
        ).map_err(|e| e.to_string())?;

        column_stats.push(stats);
    }

    Ok(TableStatistics {
        table_name,
        total_rows,
        total_columns: column_stats.len(),
        column_stats,
    })
}

/// Calculate statistics for a single column using DuckDB's built-in functions
fn calculate_column_statistics(
    conn: &duckdb::Connection,
    table_name: &str,
    column_name: &str,
    data_type: &str,
) -> DuckResult<ColumnStatistics> {
    let is_numeric = data_type.contains("INT")
        || data_type.contains("DOUBLE")
        || data_type.contains("FLOAT")
        || data_type.contains("DECIMAL")
        || data_type.contains("NUMERIC");

    // Basic statistics query
    let stats_query = if is_numeric {
        format!(
            "SELECT
                COUNT(\"{}\") as count,
                COUNT(*) - COUNT(\"{}\") as null_count,
                COUNT(DISTINCT \"{}\") as distinct_count,
                MIN(\"{}\")::VARCHAR as min_val,
                MAX(\"{}\")::VARCHAR as max_val,
                AVG(\"{}\") as mean,
                MEDIAN(\"{}\") as median,
                STDDEV_POP(\"{}\") as std_dev,
                VAR_POP(\"{}\") as variance,
                PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY \"{}\") as q25,
                PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY \"{}\") as q75
            FROM {}",
            column_name, column_name, column_name, column_name, column_name,
            column_name, column_name, column_name, column_name, column_name, column_name,
            table_name
        )
    } else {
        format!(
            "SELECT
                COUNT(\"{}\") as count,
                COUNT(*) - COUNT(\"{}\") as null_count,
                COUNT(DISTINCT \"{}\") as distinct_count,
                MIN(\"{}\")::VARCHAR as min_val,
                MAX(\"{}\")::VARCHAR as max_val,
                NULL as mean,
                NULL as median,
                NULL as std_dev,
                NULL as variance,
                NULL as q25,
                NULL as q75
            FROM {}",
            column_name, column_name, column_name, column_name, column_name,
            table_name
        )
    };

    let mut stmt = conn.prepare(&stats_query)?;
    let mut rows = stmt.query([])?;

    if let Some(row) = rows.next()? {
        let count: i64 = row.get(0)?;
        let null_count: i64 = row.get(1)?;
        let distinct_count: i64 = row.get(2)?;
        let min_str: Option<String> = row.get(3)?;
        let max_str: Option<String> = row.get(4)?;

        let min = min_str.map(|s| serde_json::Value::String(s));
        let max = max_str.map(|s| serde_json::Value::String(s));

        let mean: Option<f64> = row.get(5)?;
        let median: Option<f64> = row.get(6)?;
        let std_dev: Option<f64> = row.get(7)?;
        let variance: Option<f64> = row.get(8)?;
        let q25: Option<f64> = row.get(9)?;
        let q75: Option<f64> = row.get(10)?;

        Ok(ColumnStatistics {
            column_name: column_name.to_string(),
            count,
            null_count,
            distinct_count,
            min,
            max,
            mean,
            median,
            std_dev,
            variance,
            q25,
            q75,
            data_type: data_type.to_string(),
        })
    } else {
        Err(duckdb::Error::QueryReturnedNoRows)
    }
}

/// Perform aggregation on a column
#[tauri::command(rename_all = "camelCase")]
pub async fn aggregate_column(
    state: State<'_, AppState>,
    table_name: String,
    column_name: String,
    function: String, // "SUM", "AVG", "COUNT", "MIN", "MAX"
) -> Result<AggregationResult, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection();

    let func_upper = function.to_uppercase();
    let query = format!(
        "SELECT {}(\"{}\") FROM {}",
        func_upper, column_name, table_name
    );

    let result: serde_json::Value = conn
        .query_row(&query, [], |row| {
            // Try different types
            if let Ok(val) = row.get::<_, i64>(0) {
                Ok(serde_json::Value::Number(val.into()))
            } else if let Ok(val) = row.get::<_, f64>(0) {
                Ok(serde_json::Number::from_f64(val)
                    .map(serde_json::Value::Number)
                    .unwrap_or(serde_json::Value::Null))
            } else if let Ok(val) = row.get::<_, String>(0) {
                Ok(serde_json::Value::String(val))
            } else {
                Ok(serde_json::Value::Null)
            }
        })
        .map_err(|e| e.to_string())?;

    Ok(AggregationResult {
        column_name,
        function: func_upper,
        result,
    })
}

/// Get correlation between two numeric columns
#[tauri::command(rename_all = "camelCase")]
pub async fn calculate_correlation(
    state: State<'_, AppState>,
    table_name: String,
    column_x: String,
    column_y: String,
) -> Result<f64, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection();

    let query = format!(
        "SELECT CORR(\"{}\", \"{}\") FROM {}",
        column_x, column_y, table_name
    );

    let correlation: f64 = conn
        .query_row(&query, [], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    Ok(correlation)
}

/// Create a filtered view for virtual scrolling
#[tauri::command(rename_all = "camelCase")]
pub async fn create_filtered_view(
    state: State<'_, AppState>,
    source_table: String,
    view_name: String,
    conditions: Vec<FilterCondition>,
) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection();

    // Drop existing view if it exists
    let drop_query = format!("DROP VIEW IF EXISTS {}", view_name);
    conn.execute(&drop_query, [])
        .map_err(|e| format!("Failed to drop view: {}", e))?;

    // Build WHERE clause
    let where_clauses: Vec<String> = conditions
        .iter()
        .map(|c| build_condition_clause(c))
        .collect();

    let where_clause = if where_clauses.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", where_clauses.join(" AND "))
    };

    // Create view
    let create_query = format!(
        "CREATE VIEW {} AS SELECT * FROM {} {}",
        view_name, source_table, where_clause
    );

    conn.execute(&create_query, [])
        .map_err(|e| format!("Failed to create filtered view: {}", e))?;

    Ok(view_name)
}

/// Filter data based on conditions (legacy - now creates filtered view)
#[tauri::command(rename_all = "camelCase")]
pub async fn filter_data(
    state: State<'_, AppState>,
    table_name: String,
    conditions: Vec<FilterCondition>,
    limit: Option<usize>,
    offset: Option<usize>,
) -> Result<crate::duckdb_core::QueryResult, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let limit = limit.unwrap_or(1000);
    let offset = offset.unwrap_or(0);

    // Build WHERE clause
    let where_clauses: Vec<String> = conditions
        .iter()
        .map(|c| build_condition_clause(c))
        .collect();

    let where_clause = if where_clauses.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", where_clauses.join(" AND "))
    };

    let query = format!(
        "SELECT * FROM {} {} LIMIT {} OFFSET {}",
        table_name, where_clause, limit, offset
    );

    db.execute_query(&query)
        .map_err(|e| format!("Filter error: {}", e))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FilterCondition {
    pub column: String,
    pub operator: String, // "=", "!=", ">", "<", ">=", "<=", "LIKE", "IN"
    pub value: serde_json::Value,
}

fn build_condition_clause(condition: &FilterCondition) -> String {
    let value_str = match &condition.value {
        serde_json::Value::String(s) => format!("'{}'", s.replace("'", "''")),
        serde_json::Value::Number(n) => n.to_string(),
        serde_json::Value::Bool(b) => b.to_string(),
        serde_json::Value::Null => "NULL".to_string(),
        serde_json::Value::Array(arr) => {
            let items: Vec<String> = arr
                .iter()
                .map(|v| match v {
                    serde_json::Value::String(s) => format!("'{}'", s.replace("'", "''")),
                    serde_json::Value::Number(n) => n.to_string(),
                    _ => "NULL".to_string(),
                })
                .collect();
            format!("({})", items.join(", "))
        }
        _ => "NULL".to_string(),
    };

    match condition.operator.to_uppercase().as_str() {
        "IN" => format!("\"{}\" IN {}", condition.column, value_str),
        "LIKE" => format!("\"{}\" LIKE {}", condition.column, value_str),
        _ => format!("\"{}\" {} {}", condition.column, condition.operator, value_str),
    }
}

/// Group by and aggregate
#[tauri::command(rename_all = "camelCase")]
pub async fn group_and_aggregate(
    state: State<'_, AppState>,
    table_name: String,
    group_by_columns: Vec<String>,
    aggregations: Vec<AggregationSpec>,
) -> Result<crate::duckdb_core::QueryResult, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    // Build GROUP BY clause
    let group_cols: Vec<String> = group_by_columns
        .iter()
        .map(|c| format!("\"{}\"", c))
        .collect();

    // Build aggregation SELECT clause
    let agg_cols: Vec<String> = aggregations
        .iter()
        .map(|a| format!("{}(\"{}\") as \"{}\"", a.function, a.column, a.alias))
        .collect();

    let select_clause = if group_cols.is_empty() {
        agg_cols.join(", ")
    } else {
        format!("{}, {}", group_cols.join(", "), agg_cols.join(", "))
    };

    let query = if group_cols.is_empty() {
        format!("SELECT {} FROM {}", select_clause, table_name)
    } else {
        format!(
            "SELECT {} FROM {} GROUP BY {}",
            select_clause,
            table_name,
            group_cols.join(", ")
        )
    };

    db.execute_query(&query)
        .map_err(|e| format!("Aggregation error: {}", e))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AggregationSpec {
    pub column: String,
    pub function: String, // "SUM", "AVG", "COUNT", "MIN", "MAX", "STDDEV", "VAR"
    pub alias: String,
}
