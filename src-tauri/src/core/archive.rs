/// Archive primitives. Real implementation will move files into a
/// per-vault archive directory, update `files.current_path`, set
/// `status = archived`, and emit a `LifecycleEvent::Archived`.
pub struct ArchiveEngine;

impl ArchiveEngine {
    pub fn new() -> Self {
        Self
    }
}

impl Default for ArchiveEngine {
    fn default() -> Self {
        Self::new()
    }
}
