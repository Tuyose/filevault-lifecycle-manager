use std::path::PathBuf;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::core::scanner::{ProgressCallback, ScanProgress, ScanSummary};
use crate::db::repositories::file_repository::FileStats;
use crate::errors::AppError;
use crate::AppState;

/// Placeholder — kept for backward compat. See `scan_folder`.
#[derive(Debug, Serialize)]
pub struct ScanPreview {
    pub requested_path: String,
    pub would_scan: bool,
}

#[tauri::command]
pub fn scan_folder_preview(path: String) -> ScanPreview {
    ScanPreview {
        requested_path: path,
        would_scan: true,
    }
}

/// Recursively scan `path` and persist metadata to the database.
/// Streams `scan:progress` events. Respects pause / cancel via the
/// scan controller in AppState.
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

    // Reset the controller so a previous cancel/pause doesn't linger.
    let controller = state.scan_controller.clone();
    controller.reset();

    let app_clone = app.clone();
    let on_progress: ProgressCallback = Box::new(move |progress: ScanProgress| {
        let _ = app_clone.emit("scan:progress", &progress);
    });

    state
        .files
        .scan_with_progress(&root, on_progress, Some(controller))
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

/// Pause the running scan (if any).
#[tauri::command]
pub fn pause_scan(state: tauri::State<'_, AppState>) {
    state.scan_controller.pause();
    log::info!("scan paused by user");
}

/// Resume a paused scan.
#[tauri::command]
pub fn resume_scan(state: tauri::State<'_, AppState>) {
    state.scan_controller.resume();
    log::info!("scan resumed by user");
}

/// Cancel the running scan. The scanner will stop at the next file
/// boundary and return a partial summary.
#[tauri::command]
pub fn cancel_scan(state: tauri::State<'_, AppState>) {
    state.scan_controller.cancel();
    log::info!("scan cancelled by user");
}
