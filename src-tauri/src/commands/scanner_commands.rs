use std::path::PathBuf;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::core::scanner::{ProgressCallback, ScanProgress, ScanSummary};
use crate::db::repositories::file_repository::FileStats;
use crate::errors::AppError;
use crate::AppState;

/// Placeholder for the legacy preview command. Kept so the previous
/// wiring still resolves. Real callers should use `scan_folder`.
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
/// Streams `scan:progress` events so the frontend can show a live
/// progress bar and the current file being processed.
#[tauri::command]
pub async fn scan_folder(
    app: AppHandle,
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<ScanSummary, String> {
    if path.trim().is_empty() {
        return Err(AppError::invalid("scan path is empty").to_string());
    }

    let root = PathBuf::from(&path);

    let app_clone = app.clone();
    let on_progress: ProgressCallback = Box::new(move |progress: ScanProgress| {
        let _ = app_clone.emit("scan:progress", &progress);
    });

    state
        .files
        .scan_with_progress(&root, on_progress)
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
