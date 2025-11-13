pub mod duckdb_core;
pub mod import;
pub mod editor;
pub mod statistics;
pub mod export;

use std::sync::Mutex;

pub struct AppState {
    pub db: Mutex<duckdb_core::DatabaseConnection>,
}

impl AppState {
    pub fn new() -> Result<Self, anyhow::Error> {
        Ok(Self {
            db: Mutex::new(duckdb_core::DatabaseConnection::new()?),
        })
    }
}
