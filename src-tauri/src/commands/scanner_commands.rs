use std::path::PathBuf;

use serde::Serialize;

use crate::core::scanner::ScanSummary;
use crate::db::repositories::file_repository::FileStats;
use crate::errors::AppError;
use crate::AppState;

/// Placeholder for the legacy preview command. Kept so the previous
/// wiring still resolves during the scanner MVP rollout. Real callers
/// should use `scan_folder`.
#[derive(Debug, Serialize)]
pub struct ScanPreview {
    pub requested_path: String,
    pub would_scan: bool,
}

#[tauri::command]
pub fn scan_folder_preview(path: String) -> ScanPreview {
    log::info!("scan_folder_preview requested for {path}");
    ScanPreview {
        requested_path: path,
        would_scan: true,
    }
}

/// Recursively scan `path` and persist metadata to the database.
/// Returns a summary describing what happened.
#[tauri::command]
pub async fn scan_folder(
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<ScanSummary, String> {
    if path.trim().is_empty() {
        return Err(AppError::invalid("scan path is empty").to_string());
    }

    let root = PathBuf::from(&path);
    state
        .files
        .scan(&root)
        .await
        .map_err(|err| err.to_string())
}

/// Aggregate stats for the dashboard / scan summary views.
#[tauri::command]
pub async fn get_scan_stats(
    state: tauri::State<'_, AppState>,
) -> Result<FileStats, String> {
    state
        .files
        .aggregate_stats()
        .await
        .map_err(|err| err.to_string())
}
