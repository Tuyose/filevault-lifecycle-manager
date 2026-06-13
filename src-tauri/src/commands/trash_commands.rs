use serde::Serialize;

use crate::services::trash_service;
use crate::AppState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashStats {
    pub trashed_files: i64,
    pub trashed_size_bytes: i64,
    pub retention_days: u32,
}

#[tauri::command]
pub async fn move_file_to_trash(file_id: String, state: tauri::State<'_, AppState>) -> Result<trash_service::TrashResult, String> {
    let pool = state.database.pool().clone();
    trash_service::move_file_to_trash(&pool, &file_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn restore_file_from_trash(file_id: String, conflict_strategy: Option<String>, state: tauri::State<'_, AppState>) -> Result<trash_service::RestoreTrashResult, String> {
    let pool = state.database.pool().clone();
    trash_service::restore_file_from_trash(&pool, &file_id, conflict_strategy.as_deref().unwrap_or("rename")).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_trashed_files(state: tauri::State<'_, AppState>) -> Result<Vec<crate::models::file_record::FileRecord>, String> {
    let pool = state.database.pool().clone();
    crate::db::repositories::file_repository::FileRepository::new(pool).list_trashed_files(50, 0).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_trash_stats(state: tauri::State<'_, AppState>) -> Result<TrashStats, String> {
    let pool = state.database.pool().clone();
    let repo = crate::db::repositories::file_repository::FileRepository::new(pool.clone());
    let count = repo.count_by_status("trashed").await.unwrap_or(0);
    Ok(TrashStats { trashed_files: count, trashed_size_bytes: 0, retention_days: 30 })
}

#[tauri::command]
pub fn trash_placeholder() -> String { "trash".into() }
