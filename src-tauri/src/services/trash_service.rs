use std::path::PathBuf;
use chrono::Utc;
use serde::Serialize;

use crate::db::repositories::file_repository::FileRepository;
use crate::errors::{AppError, AppResult};
use crate::services::file_move_service::safe_move_file;
use crate::services::archive_service;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashResult {
    pub file_id: String,
    pub previous_path: String,
    pub trashed_path: String,
    pub status: String,
    pub trashed_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreTrashResult {
    pub file_id: String,
    pub restored_path: String,
    pub status: String,
    pub restored_at: String,
}

pub async fn move_file_to_trash(pool: &sqlx::SqlitePool, file_id: &str) -> AppResult<TrashResult> {
    let repo = FileRepository::new(pool.clone());

    let record = repo.find_by_id(file_id).await?
        .ok_or_else(|| AppError::not_found("File not found."))?;

    if record.status != crate::models::file_record::FileStatus::Active
        && record.status != crate::models::file_record::FileStatus::Archived
    {
        return Err(AppError::invalid("Only active or archived files can be moved to trash."));
    }

    let src = PathBuf::from(&record.current_path);
    if !src.exists() {
        return Err(AppError::invalid("Source file does not exist."));
    }
    if !src.is_file() {
        return Err(AppError::invalid("Only files can be moved to trash, not directories."));
    }

    let storage_root = archive_service::get_setting(pool, "archive.root_dir").await?
        .ok_or_else(|| AppError::invalid("FileVault storage folder is not configured."))?;
    archive_service::validate_archive_root(std::path::Path::new(&storage_root)).await?;

    let filename = src.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| format!("file_{file_id}"));
    let trashed_path = PathBuf::from(&storage_root).join(".filevault-trash").join(file_id).join(&filename);

    if trashed_path.exists() {
        return Err(AppError::invalid("Trash destination already exists."));
    }

    safe_move_file(&src, &trashed_path).await?;

    let now = Utc::now();
    let trashed_str = trashed_path.to_string_lossy().to_string();
    repo.mark_trashed(file_id, &trashed_str, now).await?;

    // Lifecycle event
    let _ = sqlx::query(
        "INSERT INTO lifecycle_events (id, file_id, event_type, from_path, to_path, created_at, metadata_json) VALUES (?,?,?,?,?,?,?)"
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(file_id)
    .bind("trash")
    .bind(&record.current_path)
    .bind(&trashed_str)
    .bind(now)
    .bind(r#"{"source":"manual","strategy":"safe_move"}"#)
    .execute(pool).await;

    Ok(TrashResult {
        file_id: file_id.to_string(),
        previous_path: record.current_path,
        trashed_path: trashed_str,
        status: "trashed".to_string(),
        trashed_at: now.to_rfc3339(),
    })
}

pub async fn restore_file_from_trash(pool: &sqlx::SqlitePool, file_id: &str, conflict_strategy: &str) -> AppResult<RestoreTrashResult> {
    let repo = FileRepository::new(pool.clone());

    let record = repo.find_by_id(file_id).await?
        .ok_or_else(|| AppError::not_found("File not found."))?;

    if record.status != crate::models::file_record::FileStatus::Trashed {
        return Err(AppError::invalid("Only trashed files can be restored."));
    }

    let src = PathBuf::from(&record.current_path);
    if !src.exists() {
        return Err(AppError::invalid("Trashed file no longer exists."));
    }
    if !src.is_file() {
        return Err(AppError::invalid("Trashed path is not a file."));
    }

    let original = PathBuf::from(&record.original_path);
    let restored_path = if !original.exists() {
        if let Some(parent) = original.parent() {
            tokio::fs::create_dir_all(parent).await.map_err(AppError::Io)?;
        }
        original.clone()
    } else {
        match conflict_strategy {
            "rename" => {
                let stem = original.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
                let ext = original.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
                let ts = Utc::now().format("%Y-%m-%d %H-%M-%S");
                original.with_file_name(format!("{stem} (restored {ts}){ext}"))
            }
            _ => return Err(AppError::invalid("Restore destination already exists.")),
        }
    };

    safe_move_file(&src, &restored_path).await?;

    let now = Utc::now();
    let restored_str = restored_path.to_string_lossy().to_string();
    repo.mark_restored_from_trash(file_id, &restored_str, now).await?;

    let _ = sqlx::query(
        "INSERT INTO lifecycle_events (id, file_id, event_type, from_path, to_path, created_at, metadata_json) VALUES (?,?,?,?,?,?,?)"
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(file_id)
    .bind("restore_from_trash")
    .bind(&record.current_path)
    .bind(&restored_str)
    .bind(now)
    .bind(r#"{"source":"manual","conflict_strategy":""#.to_string() + conflict_strategy + r#""}"#)
    .execute(pool).await;

    Ok(RestoreTrashResult {
        file_id: file_id.to_string(),
        restored_path: restored_str,
        status: "active".to_string(),
        restored_at: now.to_rfc3339(),
    })
}
