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

use std::path::PathBuf;
use std::sync::Arc;

use tauri::Manager;

use crate::core::scan_controller::ScanController;
use crate::db::Database;
use crate::services::file_service::FileService;

/// Shared, immutable application state handed to Tauri commands.
#[derive(Clone)]
pub struct AppState {
    pub database: Arc<Database>,
    pub files: Arc<FileService>,
    pub scan_controller: Arc<ScanController>,
}

impl AppState {
    pub fn new(database: Arc<Database>) -> Self {
        let pool = database.pool().clone();
        let db_path = database.path().to_path_buf();
        let files = Arc::new(FileService::with_db_path(pool, db_path));
        Self {
            database,
            files,
            scan_controller: Arc::new(ScanController::new()),
        }
    }
}

/// Entry point invoked from `main.rs`.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .try_init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir: PathBuf = app
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
            commands::scanner_commands::scan_folder,
            commands::scanner_commands::scan_folder_preview,
            commands::scanner_commands::get_scan_stats,
            commands::scanner_commands::pause_scan,
            commands::scanner_commands::resume_scan,
            commands::scanner_commands::cancel_scan,
            commands::archive_commands::archive_placeholder,
            commands::trash_commands::trash_placeholder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
