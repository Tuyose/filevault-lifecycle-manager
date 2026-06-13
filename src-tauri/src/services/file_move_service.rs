use std::path::Path;
use tokio::fs;

use crate::errors::{AppError, AppResult};

/// Safe cross-drive file move. Tries atomic rename first, falls back to
/// copy + verify + delete. Never deletes the source before the destination
/// copy is verified.
pub async fn safe_move_file(src: &Path, dst: &Path) -> AppResult<()> {
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent).await.map_err(AppError::Io)?;
    }
    match fs::rename(src, dst).await {
        Ok(()) => return Ok(()),
        Err(e) => log::warn!("rename failed ({}), falling back to copy+verify for {} → {}", e, src.display(), dst.display()),
    }
    let size = fs::metadata(src).await.map_err(AppError::Io)?.len();
    fs::copy(src, dst).await.map_err(AppError::Io)?;
    let copied_size = fs::metadata(dst).await.map_err(AppError::Io)?.len();
    if copied_size != size {
        let _ = fs::remove_file(dst).await;
        return Err(AppError::internal(format!("copy verification failed: sizes differ ({} vs {})", size, copied_size)));
    }
    fs::remove_file(src).await.map_err(AppError::Io)?;
    Ok(())
}
