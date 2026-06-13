use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::SystemTime;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tokio::fs;
use walkdir::WalkDir;

use crate::core::scan_controller::ScanController;
use crate::db::repositories::file_repository::{FileRepository, FileUpsert, UpsertOutcome};
use crate::errors::{AppError, AppResult};
use crate::services::hash_service::HashService;
use uuid::Uuid;

// ── Public types ─────────────────────────────────────────────────

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

/// Streamed from Rust → frontend while a scan is running.
/// `total_files` is resolved by a fast pre-count at the start so the
/// UI can compute a meaningful percentage.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanProgress {
    pub processed: i64,
    pub total_files: i64,
    pub current_path: String,
    pub current_dir: String,
    pub phase: String,
    pub job_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ProgressPhase {
    Counting,
    Scanning,
    Done,
}

/// Opaque callback type that the scanner calls for each file. The
/// command handler wires this to Tauri's event system.
pub type ProgressCallback = Box<dyn Fn(ScanProgress) + Send + Sync>;

// ── Scanner ───────────────────────────────────────────────────────

pub struct Scanner {
    files: FileRepository,
    skip_paths: Vec<PathBuf>,
    on_progress: Option<ProgressCallback>,
    controller: Option<Arc<ScanController>>,
    hash_service: Option<HashService>,
    job_id: Option<String>,
}

impl Scanner {
    pub fn new(files: FileRepository) -> Self {
        Self {
            files,
            skip_paths: Vec::new(),
            on_progress: None,
            controller: None,
            hash_service: None,
            job_id: None,
        }
    }

    pub fn with_skip_paths(mut self, paths: Vec<PathBuf>) -> Self {
        self.skip_paths = paths;
        self
    }

    pub fn with_progress_callback(mut self, cb: ProgressCallback) -> Self {
        self.on_progress = Some(cb);
        self
    }

    pub fn with_controller(mut self, controller: Arc<ScanController>) -> Self {
        self.controller = Some(controller);
        self
    }

    pub fn with_hash_service(mut self, hasher: HashService) -> Self {
        self.hash_service = Some(hasher);
        self
    }

    pub fn with_job_id(mut self, job_id: String) -> Self {
        self.job_id = Some(job_id);
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

        // ── Pre-count: fast walk to find total file count ──
        let total_files = count_files(root, &self.skip_paths) as i64;
        summary.total_seen = total_files;

        self.emit(ScanProgress {
            processed: 0,
            total_files,
            current_path: String::new(),
            current_dir: root.display().to_string(),
            phase: "Scanning".to_string(),
            job_id: String::new(),
        });

        let canonical_root = root.to_path_buf();
        let mut processed: i64 = 0;

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
                    let current_path = dir_entry.path().display().to_string();
                    let parent_dir = dir_entry
                        .path()
                        .parent()
                        .map(|p| p.display().to_string())
                        .unwrap_or_default();

                    match process_file(dir_entry.path(), &canonical_root).await {
                        Ok(mut upsert) => {
                            // Hash the file if a hash service is available.
                            // Errors are collected but the scan continues.
                            if let Some(ref hasher) = self.hash_service {
                                match hasher.calculate_blake3(dir_entry.path()).await {
                                    Ok(hash) => upsert.hash = Some(hash),
                                    Err(err) => {
                                        summary.errors += 1;
                                        if summary.error_samples.len() < 10 {
                                            summary.error_samples.push(ScanErrorItem {
                                                path: current_path.clone(),
                                                message: format!("hash error: {err}"),
                                            });
                                        }
                                    }
                                }
                            }
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
                                    path: current_path.clone(),
                                    message: err.to_string(),
                                });
                            }
                        }
                    }

                    processed += 1;
                    self.emit(ScanProgress {
                        processed,
                        total_files,
                        current_path,
                        current_dir: parent_dir,
                        phase: "Scanning".to_string(),
            job_id: String::new(),
                    });

                    // Honour pause / cancel every file boundary
                    if let Some(ref ctrl) = self.controller {
                        if ctrl.is_cancelled() {
                            break;
                        }
                        if !ctrl.wait_if_paused().await {
                            break;
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

        self.emit(ScanProgress {
            processed,
            total_files,
            current_path: String::new(),
            current_dir: String::new(),
            phase: "Done".to_string(),
            job_id: String::new(),
        });

        Ok(summary)
    }

    fn emit(&self, mut progress: ScanProgress) {
        if progress.job_id.is_empty() {
            progress.job_id = self.job_id.clone().unwrap_or_default();
        }
        if let Some(ref cb) = self.on_progress {
            cb(progress);
        }
    }
}

// ── Pre-count ─────────────────────────────────────────────────────

fn count_files(root: &Path, skip_paths: &[PathBuf]) -> usize {
    WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| !is_hidden(e.path()) && !is_skipped(e.path(), skip_paths))
        .flatten()
        .filter(|e| e.file_type().is_file())
        .count()
}

// ── Helpers ───────────────────────────────────────────────────────

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

async fn process_file(path: &Path, _root: &Path) -> AppResult<FileUpsert> {
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

    Ok(FileUpsert {
        id: Uuid::new_v4().to_string(),
        original_path: current_path.clone(),
        current_path,
        file_name,
        extension,
        size_bytes,
        hash: None,
        created_at: created_at.unwrap_or_else(Utc::now),
        modified_at,
        last_seen_at: Utc::now(),
    })
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
