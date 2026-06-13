use std::path::{Path, PathBuf};
use std::time::SystemTime;

use chrono::{DateTime, Utc};
use serde::Serialize;
use tokio::fs;
use walkdir::WalkDir;

use crate::db::repositories::file_repository::{FileRepository, FileUpsert, UpsertOutcome};
use crate::errors::{AppError, AppResult};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Default)]
pub struct ScanSummary {
    pub root: String,
    pub total_seen: i64,
    pub inserted: i64,
    pub updated: i64,
    pub errors: i64,
    pub total_bytes: i64,
    pub started_at: DateTime<Utc>,
    pub finished_at: DateTime<Utc>,
    pub error_samples: Vec<ScanErrorItem>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ScanErrorItem {
    pub path: String,
    pub message: String,
}

/// Engine that walks a directory, extracts metadata, and hands each
/// file to the repository for persistence. Pure logic — no Tauri
/// imports, no IPC types — so it can be unit-tested or invoked from a
/// background worker in a later milestone.
pub struct Scanner {
    files: FileRepository,
    skip_paths: Vec<PathBuf>,
}

impl Scanner {
    pub fn new(files: FileRepository) -> Self {
        Self {
            files,
            skip_paths: Vec::new(),
        }
    }

    /// Add absolute paths whose descendants (or themselves) should be
    /// excluded from the walk. Used to keep the SQLite database and
    /// its WAL sidecars out of the scan results.
    pub fn with_skip_paths(mut self, paths: Vec<PathBuf>) -> Self {
        self.skip_paths = paths;
        self
    }

    /// Walk `root` recursively and upsert every regular file.
    /// Errors on individual files are collected into the summary and
    /// do not abort the scan.
    pub async fn scan(&self, root: &Path) -> AppResult<ScanSummary> {
        let metadata = fs::metadata(root).await.map_err(|err| match err.kind() {
            std::io::ErrorKind::NotFound => AppError::not_found(root.display().to_string()),
            _ => AppError::Io(err),
        })?;
        if !metadata.is_dir() {
            return Err(AppError::invalid(format!(
                "scan root is not a directory: {}",
                root.display()
            )));
        }

        let started_at = Utc::now();
        let mut summary = ScanSummary {
            root: root.display().to_string(),
            started_at,
            ..Default::default()
        };

        let canonical_root = root.to_path_buf();

        for entry in WalkDir::new(&canonical_root)
            .follow_links(false)
            .into_iter()
            .filter_entry(|e| !is_hidden(e.path()) && !is_skipped(e.path(), &self.skip_paths))
        {
            match entry {
                Ok(dir_entry) => {
                    if !dir_entry.file_type().is_file() {
                        continue;
                    }
                    summary.total_seen += 1;

                    match process_file(&dir_entry.path(), &canonical_root).await {
                        Ok(upsert) => {
                            summary.total_bytes += upsert.size_bytes;
                            match self.files.upsert(&upsert).await? {
                                UpsertOutcome::Inserted => summary.inserted += 1,
                                UpsertOutcome::Updated => summary.updated += 1,
                            }
                        }
                        Err(err) => {
                            summary.errors += 1;
                            if summary.error_samples.len() < 10 {
                                summary.error_samples.push(ScanErrorItem {
                                    path: dir_entry.path().display().to_string(),
                                    message: err.to_string(),
                                });
                            }
                        }
                    }
                }
                Err(err) => {
                    summary.errors += 1;
                    if summary.error_samples.len() < 10 {
                        let path = err
                            .path()
                            .map(|p| p.display().to_string())
                            .unwrap_or_else(|| "<unknown>".to_string());
                        summary.error_samples.push(ScanErrorItem {
                            path,
                            message: err.to_string(),
                        });
                    }
                }
            }
        }

        summary.finished_at = Utc::now();
        Ok(summary)
    }
}

fn is_hidden(path: &Path) -> bool {
    path.file_name()
        .and_then(|s| s.to_str())
        .map(|s| s.starts_with('.'))
        .unwrap_or(false)
}

fn is_skipped(path: &Path, skip_paths: &[PathBuf]) -> bool {
    for skip in skip_paths {
        if path == skip.as_path() {
            return true;
        }
        if path.starts_with(skip) {
            return true;
        }
    }
    false
}

async fn process_file(path: &Path, root: &Path) -> AppResult<FileUpsert> {
    let metadata = fs::metadata(path).await?;
    if !metadata.is_file() {
        return Err(AppError::invalid(format!(
            "not a regular file: {}",
            path.display()
        )));
    }

    let file_name = path
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| AppError::invalid(format!("invalid file name: {}", path.display())))?
        .to_string();

    let extension = path
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_ascii_lowercase());

    let size_bytes = metadata.len() as i64;
    let created_at = system_time_to_chrono(metadata.created().ok());
    let modified_at = system_time_to_chrono(metadata.modified().ok());

    let current_path = normalize_path(path);
    let original_path = derive_original_path(&current_path, root);

    Ok(FileUpsert {
        id: Uuid::new_v4().to_string(),
        original_path,
        current_path,
        file_name,
        extension,
        size_bytes,
        created_at: created_at.unwrap_or_else(Utc::now),
        modified_at,
        last_seen_at: Utc::now(),
    })
}

fn derive_original_path(current: &str, root: &Path) -> String {
    // For the MVP the original path is the same as the current path —
    // archive / move / rename features are out of scope and will
    // repopulate `current_path` later. Keeping them identical now means
    // a re-scan can correctly match the row.
    let _ = root;
    current.to_string()
}

fn normalize_path(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

fn system_time_to_chrono(time: Option<SystemTime>) -> Option<DateTime<Utc>> {
    time.and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| {
            DateTime::<Utc>::from_timestamp(d.as_secs() as i64, d.subsec_nanos())
                .unwrap_or_else(Utc::now)
        })
}
