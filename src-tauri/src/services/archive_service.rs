use std::path::{Path, PathBuf};

use chrono::Utc;
use serde::Serialize;
use sqlx::Row;
use tokio::fs;

use crate::db::repositories::file_repository::FileRepository;
use crate::errors::{AppError, AppResult};
use crate::models::file_record::FileRecord;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveResult {
    pub file_id: String,
    pub original_path: String,
    pub archived_path: String,
    pub status: String,
    pub archived_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct RestoreResult {
    pub file_id: String,
    pub restored_path: String,
    pub status: String,
}

/// Resolves the app_settings key from the generic settings table.
pub async fn get_setting(pool: &sqlx::SqlitePool, key: &str) -> AppResult<Option<String>> {
    let row = sqlx::query("SELECT value FROM app_settings WHERE key = ?")
        .bind(key)
        .fetch_optional(pool)
        .await?;
    Ok(row.map(|r| r.get::<String, _>(0)))
}

pub async fn set_setting(pool: &sqlx::SqlitePool, key: &str, value: &str) -> AppResult<()> {
    sqlx::query("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)")
        .bind(key).bind(value)
        .execute(pool).await?;
    Ok(())
}

pub async fn delete_setting(pool: &sqlx::SqlitePool, key: &str) -> AppResult<()> {
    sqlx::query("DELETE FROM app_settings WHERE key = ?")
        .bind(key)
        .execute(pool).await?;
    Ok(())
}

/// Validate that an archive root path is usable: exists, is a directory, and is writable.
pub async fn validate_archive_root(path: &std::path::Path) -> AppResult<()> {
    if !path.exists() {
        return Err(AppError::invalid("Archive root path does not exist."));
    }
    if !path.is_dir() {
        return Err(AppError::invalid("Archive root must be a directory."));
    }
    // Write test
    let test_file = path.join(".filevault_write_test");
    match tokio::fs::write(&test_file, b"test").await {
        Ok(()) => { let _ = tokio::fs::remove_file(&test_file).await; Ok(()) }
        Err(_) => Err(AppError::invalid("FileVault cannot write to this folder.")),
    }
}

/// Move a file safely — prefers rename, falls back to copy+verify+delete.
async fn safe_move(src: &Path, dst: &Path) -> AppResult<()> {
    // Ensure parent dir exists
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent).await.map_err(AppError::Io)?;
    }
    // Try rename first
    match fs::rename(src, dst).await {
        Ok(()) => return Ok(()),
        Err(e) => log::warn!("rename failed ({e}), falling back to copy+verify for {} → {}", src.display(), dst.display()),
    }
    // Fallback: copy + verify + delete
    let size = fs::metadata(src).await.map_err(AppError::Io)?.len();
    fs::copy(src, dst).await.map_err(AppError::Io)?;
    let copied_size = fs::metadata(dst).await.map_err(AppError::Io)?.len();
    if copied_size != size {
        // Clean up failed copy
        let _ = fs::remove_file(dst).await;
        return Err(AppError::internal(format!("copy verification failed: sizes differ ({} vs {})", size, copied_size)));
    }
    fs::remove_file(src).await.map_err(AppError::Io)?;
    Ok(())
}

pub async fn archive_file(pool: &sqlx::SqlitePool, file_id: &str) -> AppResult<ArchiveResult> {
    let repo = FileRepository::new(pool.clone());

    // 1. Get file record
    let record = repo.find_by_id(file_id).await?
        .ok_or_else(|| AppError::not_found(format!("File not found: {file_id}")))?;

    // 2. Verify status is active
    if record.status != crate::models::file_record::FileStatus::Active {
        return Err(AppError::invalid("Only active files can be archived."));
    }

    // 3. Verify current_path exists and is a file
    let src = PathBuf::from(&record.current_path);
    if !src.exists() {
        return Err(AppError::invalid("Source file does not exist."));
    }
    if !src.is_file() {
        return Err(AppError::invalid("Only files can be archived, not directories."));
    }

    // 4. Verify archive root is configured
    let archive_root = get_setting(pool, "archive.root_dir").await?
        .ok_or_else(|| AppError::invalid("Archive root is not configured. Please set it in Settings or the Archive page."))?;

    // 5. Validate archive root is still usable
    let root_path = std::path::Path::new(&archive_root);
    validate_archive_root(root_path).await?;

    // 6. Build archive path
    let filename = src.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| format!("file_{file_id}"));
    let archived_path = PathBuf::from(&archive_root)
        .join(".filevault-archive")
        .join(file_id)
        .join(&filename);

    // 7. Verify destination does not already exist
    if archived_path.exists() {
        return Err(AppError::invalid("Archive destination already exists."));
    }

    // 8. Safe move
    safe_move(&src, &archived_path).await?;

    // 6. Update DB
    let now = Utc::now();
    let archived_str = archived_path.to_string_lossy().to_string();
    repo.archive_file_repo(file_id, &archived_str, now).await?;

    // 7. Record lifecycle event
    let _ = sqlx::query(
        "INSERT INTO lifecycle_events (id, file_id, event_type, from_path, to_path, created_at, metadata_json) VALUES (?,?,?,?,?,?,?)"
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(file_id)
    .bind("archive")
    .bind(&record.current_path)
    .bind(&archived_str)
    .bind(now)
    .bind(r#"{"source":"manual","archive_root":""#.to_string() + &archive_root + r#"","strategy":"safe_move"}"#)
    .execute(pool)
    .await;

    Ok(ArchiveResult {
        file_id: file_id.to_string(),
        original_path: record.original_path,
        archived_path: archived_str,
        status: "archived".to_string(),
        archived_at: now.to_rfc3339(),
    })
}

pub async fn restore_file(pool: &sqlx::SqlitePool, file_id: &str, conflict_strategy: &str) -> AppResult<RestoreResult> {
    let repo = FileRepository::new(pool.clone());

    let record = repo.find_by_id(file_id).await?
        .ok_or_else(|| AppError::not_found(format!("file {file_id}")))?;

    if record.status != crate::models::file_record::FileStatus::Archived {
        return Err(AppError::invalid("only archived files can be restored"));
    }

    let mut restore_target = PathBuf::from(&record.original_path);

    // Handle conflict
    if restore_target.exists() {
        match conflict_strategy {
            "rename" => {
                let stem = restore_target.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
                let ext = restore_target.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
                let ts = Utc::now().format("%Y-%m-%d %H-%M-%S");
                let new_name = format!("{stem} (restored {ts}){ext}");
                restore_target = restore_target.parent().unwrap_or(Path::new(".")).join(new_name);
            }
            _ => return Err(AppError::invalid("original path already exists — use rename strategy or move existing file")),
        }
    }

    // Move
    let src = PathBuf::from(&record.current_path);
    if let Some(parent) = restore_target.parent() {
        fs::create_dir_all(parent).await.map_err(AppError::Io)?;
    }
    fs::rename(&src, &restore_target).await.map_err(AppError::Io)?;

    // Update DB
    let restored = restore_target.to_string_lossy().to_string();
    repo.mark_restored(file_id, &restored).await?;

    // Lifecycle
    let _ = sqlx::query(
        "INSERT INTO lifecycle_events (id, file_id, event_type, from_path, to_path, created_at, metadata_json) VALUES (?,?,?,?,?,?,?)"
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(file_id)
    .bind("restore")
    .bind(&record.current_path)
    .bind(&restored)
    .bind(Utc::now())
    .bind(format!(r#"{{"conflict_strategy":"{}"}}"#, conflict_strategy))
    .execute(pool)
    .await;

    Ok(RestoreResult {
        file_id: file_id.to_string(),
        restored_path: restored,
        status: "active".to_string(),
    })
}
