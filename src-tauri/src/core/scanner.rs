use std::path::Path;

use crate::errors::{AppError, AppResult};

/// Lightweight preview of what a scan would touch. Real scanner will
/// walk directories, stream file metadata, and hand batches off to the
/// hashing pipeline. For the skeleton we just stat the root and report
/// existence.
#[derive(Debug, serde::Serialize)]
pub struct ScanPreviewCore {
    pub path: String,
    pub exists: bool,
    pub is_dir: bool,
}

pub struct Scanner;

impl Scanner {
    pub fn new() -> Self {
        Self
    }

    pub async fn preview(&self, path: &Path) -> AppResult<ScanPreviewCore> {
        let metadata = tokio::fs::metadata(path)
            .await
            .map_err(|err| match err.kind() {
                std::io::ErrorKind::NotFound => AppError::not_found(path.display().to_string()),
                _ => AppError::Io(err),
            })?;

        Ok(ScanPreviewCore {
            path: path.display().to_string(),
            exists: true,
            is_dir: metadata.is_dir(),
        })
    }
}

impl Default for Scanner {
    fn default() -> Self {
        Self::new()
    }
}
