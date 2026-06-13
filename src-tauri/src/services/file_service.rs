use crate::db::repositories::file_repository::FileRepository;

/// Coordinates file-related operations across repositories. The real
/// implementation will own scanner coordination, hash dispatch, and
/// lifecycle event emission; for now it only exposes a couple of
/// thin accessors so commands can be wired up.
#[derive(Clone)]
pub struct FileService {
    files: FileRepository,
}

impl FileService {
    pub fn new(files: FileRepository) -> Self {
        Self { files }
    }

    pub async fn tracked_file_count(&self) -> crate::errors::AppResult<i64> {
        self.files.count().await
    }
}
