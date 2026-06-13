use crate::models::file_record::FileStatus;

/// Centralised state machine for a file's lifecycle.
///
/// The transitions are deliberately explicit so future audit / undo
/// features can rely on the invariants:
///
/// ```text
///   Active ──► Archived ──► Active     (restore from archive)
///   Active ──► Trashed  ──► Active     (restore from trash)
///   Active ──► Trashed  ──► Deleted    (purge after grace period)
///   Archived ──► Trashed                (archive → trash)
/// ```
pub struct FileLifecycle;

impl FileLifecycle {
    pub fn can_transition(from: FileStatus, to: FileStatus) -> bool {
        use FileStatus::*;
        matches!(
            (from, to),
            (Active, Archived)
                | (Active, Trashed)
                | (Archived, Active)
                | (Archived, Trashed)
                | (Trashed, Active)
                | (Trashed, Deleted)
        )
    }
}
