/// Restores files from the trash or archive back to their original
/// location (or a user-selected target). Real implementation will
/// reuse the same primitives as `archive_service`/`trash_service`,
/// just in reverse, and emit a `Restored` lifecycle event.
pub struct RestoreService;

impl RestoreService {
    pub fn new() -> Self {
        Self
    }
}

impl Default for RestoreService {
    fn default() -> Self {
        Self::new()
    }
}
