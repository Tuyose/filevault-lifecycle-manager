use std::path::Path;
use std::sync::Arc;

use blake3::Hasher;
use tokio::fs::File;
use tokio::io::AsyncReadExt;
use tokio::sync::Semaphore;

use crate::errors::AppResult;

/// Streaming BLAKE3 hasher with controlled concurrency.
///
/// Uses a `tokio::sync::Semaphore` to limit the number of concurrent
/// hash operations (default 4). Each hash streams the file in 64 KB
/// chunks so memory usage stays bounded regardless of file size.
#[derive(Clone)]
pub struct HashService {
    semaphore: Arc<Semaphore>,
}

impl HashService {
    pub fn new() -> Self {
        Self {
            semaphore: Arc::new(Semaphore::new(4)),
        }
    }

    /// Create a hasher with a custom concurrency limit.
    pub fn with_max_concurrent(max: usize) -> Self {
        Self {
            semaphore: Arc::new(Semaphore::new(max)),
        }
    }

    /// Compute the BLAKE3 hex digest of `path` by streaming the file
    /// in 64 KB chunks. Respects the concurrency semaphore so callers
    /// can call this for many files in parallel without exhausting the
    /// system's I/O capacity.
    pub async fn calculate_blake3(&self, path: &Path) -> AppResult<String> {
        // Acquire a semaphore permit — this is what limits concurrency.
        let _permit = self.semaphore.acquire().await;

        let mut file = File::open(path).await?;
        let mut hasher = Hasher::new();
        let mut buf = vec![0u8; 65_536]; // 64 KB

        loop {
            let n = file.read(&mut buf).await?;
            if n == 0 {
                break;
            }
            hasher.update(&buf[..n]);
        }

        let hash = hasher.finalize();
        Ok(hash.to_hex().to_string())
    }
}

impl Default for HashService {
    fn default() -> Self {
        Self::new()
    }
}
