//! Tests for archive root configuration — setting, getting, validating, clearing.

#[cfg(test)]
mod tests {
    use std::path::PathBuf;
    use tempdir::TempDir;
    use tokio::runtime::Runtime;

    fn rt() -> Runtime {
        Runtime::new().expect("tokio runtime")
    }

    #[test]
    fn validate_valid_temp_dir() {
        let dir = TempDir::new("fv-archive-test").unwrap();
        let path = dir.path().to_path_buf();
        let result = rt().block_on(
            filevault_lifecycle_manager_lib::services::archive_service::validate_archive_root(&path)
        );
        assert!(result.is_ok(), "valid temp dir should pass validation");
    }

    #[test]
    fn validate_non_existing_path_fails() {
        let path = PathBuf::from("Z:\\this\\does\\not\\exist\\anywhere");
        let result = rt().block_on(
            filevault_lifecycle_manager_lib::services::archive_service::validate_archive_root(&path)
        );
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("does not exist"), "expected 'does not exist', got: {err}");
    }

    #[test]
    fn validate_file_path_fails() {
        let dir = TempDir::new("fv-archive-test").unwrap();
        let file_path = dir.path().join("test_file.txt");
        std::fs::write(&file_path, b"data").unwrap();
        let result = rt().block_on(
            filevault_lifecycle_manager_lib::services::archive_service::validate_archive_root(&file_path)
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("directory"));
    }
}
