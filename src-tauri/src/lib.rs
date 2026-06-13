//! Top-level library crate for the FileVault desktop app.
//!
//! Wires Tauri, plugins, command handlers, and shared application state
//! (database pool, settings) together. Feature implementations live in
//! their own modules (`core`, `services`, `db`, ...); this file should
//! stay focused on composition.

pub mod commands;
pub mod core;
pub mod db;
pub mod errors;
pub mod models;
pub mod services;

use std::sync::Arc;

use tauri::Manager;

use crate::db::Database;

/// Shared, immutable application state handed to Tauri commands.
///
/// Cloning is cheap — the inner `Database` is wrapped in `Arc`, so we
/// can hand it to every command without lifetime gymnastics.
#[derive(Clone)]
pub struct AppState {
    pub database: Arc<Database>,
}

impl AppState {
    pub fn new(database: Arc<Database>) -> Self {
        Self { database }
    }
}

/// Entry point invoked from `main.rs`.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialise structured logging early so any setup error is visible.
    let _ = env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .try_init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Resolve a per-app data directory and bootstrap the SQLite file there.
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data directory");
            std::fs::create_dir_all(&data_dir).expect("failed to create app data dir");

            let db_path = data_dir.join("filevault.db");
            let database = Database::open(&db_path).expect("failed to open database");
            database.run_migrations().expect("failed to run migrations");

            let state = AppState::new(Arc::new(database));
            app.manage(state);

            log::info!("FileVault started; db at {}", db_path.display());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::system_commands::get_app_status,
            commands::system_commands::get_database_status,
            commands::scanner_commands::scan_folder_preview,
            commands::archive_commands::archive_placeholder,
            commands::trash_commands::trash_placeholder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
