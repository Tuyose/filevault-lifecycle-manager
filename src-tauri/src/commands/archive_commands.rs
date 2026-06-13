use serde::{Deserialize, Serialize};

use crate::services::archive_service;
use crate::AppState;

#[derive(Debug, Serialize)]
pub struct ArchiveAck {
    pub accepted: bool,
}

#[tauri::command]
pub fn archive_placeholder(file_id: String) -> ArchiveAck {
    log::info!("archive_placeholder requested for {file_id}");
    ArchiveAck { accepted: true }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveStats {
    pub archived_files: i64,
    pub archived_size_bytes: i64,
    pub archive_root: Option<String>,
}

#[tauri::command]
pub async fn get_archive_root(state: tauri::State<'_, AppState>) -> Result<Option<String>, String> {
    let pool = state.database.pool().clone();
    archive_service::get_setting(&pool, "archive.root_dir").await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_archive_root(path: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let p = std::path::PathBuf::from(&path);
    archive_service::validate_archive_root(&p).await.map_err(|e| e.to_string())?;
    let pool = state.database.pool().clone();
    archive_service::set_setting(&pool, "archive.root_dir", &path).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn clear_archive_root(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let pool = state.database.pool().clone();
    archive_service::delete_setting(&pool, "archive.root_dir").await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn archive_file(file_id: String, state: tauri::State<'_, AppState>) -> Result<archive_service::ArchiveResult, String> {
    let pool = state.database.pool().clone();
    archive_service::archive_file(&pool, &file_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn restore_file(file_id: String, conflict_strategy: Option<String>, state: tauri::State<'_, AppState>) -> Result<archive_service::RestoreResult, String> {
    let pool = state.database.pool().clone();
    archive_service::restore_file(&pool, &file_id, conflict_strategy.as_deref().unwrap_or("rename")).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_archived_files(state: tauri::State<'_, AppState>) -> Result<Vec<crate::models::file_record::FileRecord>, String> {
    let pool = state.database.pool().clone();
    crate::db::repositories::file_repository::FileRepository::new(pool)
        .list_archived_files_repo(50, 0).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_archive_info(state: tauri::State<'_, AppState>) -> Result<ArchiveStats, String> {
    let pool = state.database.pool().clone();
    let root = archive_service::get_setting(&pool, "archive.root_dir").await.ok().flatten();
    let repo = crate::db::repositories::file_repository::FileRepository::new(pool.clone());
    let count = repo.count_by_status("archived").await.unwrap_or(0);
    Ok(ArchiveStats { archive_root: root, archived_files: count, archived_size_bytes: 0 })
}
