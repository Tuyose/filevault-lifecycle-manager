use serde::Serialize;

use crate::AppState;

/// Lightweight readiness probe for the React shell.
#[derive(Debug, Serialize)]
pub struct AppStatus {
    pub name: &'static str,
    pub version: &'static str,
    pub ready: bool,
}

#[derive(Debug, Serialize)]
pub struct DatabaseStatus {
    pub healthy: bool,
    pub path: String,
}

/// Returns basic app metadata. Confirms the React side can talk to Rust
/// over the Tauri IPC bridge.
#[tauri::command]
pub fn get_app_status() -> AppStatus {
    AppStatus {
        name: "FileVault Lifecycle Manager",
        version: env!("CARGO_PKG_VERSION"),
        ready: true,
    }
}

/// Verifies that the managed `AppState` (and therefore the database
/// connection) is available. Used by the dashboard to surface
/// initialisation errors gracefully.
#[tauri::command]
pub fn get_database_status(state: tauri::State<'_, AppState>) -> Result<DatabaseStatus, String> {
    let db = state.database.clone();
    let path = db.path().display().to_string();
    db.ping()
        .map(|healthy| DatabaseStatus { healthy, path })
        .map_err(|err| err.to_string())
}
