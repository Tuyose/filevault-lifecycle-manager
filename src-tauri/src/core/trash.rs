/// Soft-delete primitives. Real implementation will move files into a
/// `.filevault-trash` directory, record `trashed_at`, and expose a
/// restore window governed by `RetentionService`.
pub struct TrashEngine;

impl TrashEngine {
    pub fn new() -> Self {
        Self
    }
}

impl Default for TrashEngine {
    fn default() -> Self {
        Self::new()
    }
}
