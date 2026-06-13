//! Top-level library crate for the FileVault desktop app.

pub mod commands;
pub mod core;
pub mod db;
pub mod errors;
pub mod models;
pub mod services;

use std::path::PathBuf;
use std::sync::Arc;

use tauri::Manager;

use core::scan_controller::ScanController;
use core::scan_job::ScanJobManager;
use crate::db::repositories::watch_folder_repository::WatchFolderRepository;
use crate::db::Database;
use crate::services::file_service::FileService;
use crate::services::scheduler_service::{SchedulerService, SchedulerStatus};

/// Shared, immutable application state handed to Tauri commands.
#[derive(Clone)]
pub struct AppState {
    pub database: Arc<Database>,
    pub files: Arc<FileService>,
    pub scan_controller: Arc<ScanController>,
    pub scan_job_manager: Arc<ScanJobManager>,
    pub scheduler: Arc<SchedulerService>,
}

impl AppState {
    pub fn new(database: Arc<Database>) -> Self {
        let pool = database.pool().clone();
        let db_path = database.path().to_path_buf();
        let files = Arc::new(FileService::with_db_path(pool.clone(), db_path));
        let repo = WatchFolderRepository::new(pool);
        let scheduler = Arc::new(SchedulerService::new(repo, files.clone()));
        Self {
            database,
            files,
            scan_controller: Arc::new(ScanController::new()),
            scan_job_manager: Arc::new(ScanJobManager::new()),
            scheduler,
        }
    }

    pub async fn scheduler_status(&self) -> Result<SchedulerStatus, String> {
        Ok(self.scheduler.status().await)
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

            // Start the background scheduler
            state.scheduler.start();

            app.manage(state);

            log::info!("FileVault started; db at {}", db_path.display());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::system_commands::get_app_status,
            commands::system_commands::get_database_status,
            commands::scanner_commands::scan_folder,
            commands::scanner_commands::start_scan_job,
            commands::scanner_commands::scan_folder_preview,
            commands::scanner_commands::get_scan_stats,
            commands::scanner_commands::get_scan_history,
            commands::scanner_commands::get_duplicate_groups,
            commands::scanner_commands::pause_scan,
            commands::scanner_commands::resume_scan,
            commands::scanner_commands::cancel_scan,
            commands::analytics_commands::get_dashboard_analytics,
            commands::scanner_commands::get_active_scan_job,
            commands::analytics_commands::get_health_breakdown,
            commands::analytics_commands::get_scan_trends,
            commands::watch_folder_commands::list_watch_folders,
            commands::watch_folder_commands::add_watch_folder,
            commands::watch_folder_commands::update_watch_folder,
            commands::watch_folder_commands::delete_watch_folder,
            commands::watch_folder_commands::toggle_watch_folder,
            commands::watch_folder_commands::run_watch_folder_scan,
            commands::watch_folder_commands::get_scheduler_status,
            commands::archive_commands::get_archive_root,
            commands::archive_commands::set_archive_root,
            commands::archive_commands::clear_archive_root,
            commands::archive_commands::archive_file,
            commands::archive_commands::restore_file,
            commands::archive_commands::list_archived_files,
            commands::archive_commands::get_archive_info,
            commands::archive_commands::list_active_files,
            commands::archive_commands::reveal_file_in_explorer,
            commands::archive_commands::open_containing_folder,
            commands::archive_commands::get_file_current_path,
            commands::archive_commands::archive_placeholder,
            commands::trash_commands::trash_placeholder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
