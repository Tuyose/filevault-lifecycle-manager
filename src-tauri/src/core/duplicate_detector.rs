/// Duplicate detection. The full pipeline will:
///   1. Group candidates by `(size, partial_hash)` for a quick pre-filter.
///   2. Re-hash candidates with BLAKE3 for the definitive equality check.
///   3. Surface groups in the UI with options to keep, move, or delete.
///
/// Skeleton returns an empty report so the UI has something to render.
#[derive(Debug, Default, serde::Serialize)]
pub struct DuplicateReport {
    pub groups: usize,
    pub duplicate_files: usize,
    pub reclaimable_bytes: u64,
}

pub struct DuplicateDetector;

impl DuplicateDetector {
    pub fn new() -> Self {
        Self
    }

    pub async fn scan(&self) -> crate::errors::AppResult<DuplicateReport> {
        Ok(DuplicateReport::default())
    }
}

impl Default for DuplicateDetector {
    fn default() -> Self {
        Self::new()
    }
}
