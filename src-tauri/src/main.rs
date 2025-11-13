// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use rats_lib::{AppState, duckdb_core, import, editor, statistics, export};
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let state = AppState::new().expect("Failed to initialize app state");
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Import
            import::import_file,
            import::preview_file,
            // Query
            duckdb_core::query_data,
            duckdb_core::get_table_info,
            duckdb_core::drop_table,
            // Editor
            editor::reorder_rows,
            // Statistics
            statistics::get_table_statistics,
            statistics::aggregate_column,
            statistics::calculate_correlation,
            statistics::filter_data,
            statistics::group_and_aggregate,
            // Export
            export::export_to_csv,
            export::export_to_excel,
            export::export_query_to_csv,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
