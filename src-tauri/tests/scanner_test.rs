//! Integration test for the scanner MVP. Creates a temp directory tree
//! with a handful of files, runs the scanner, asserts inserts happen on
//! the first pass and updates (no duplicates) on the second pass.

use std::fs;
use std::path::Path;

use filevault_lifecycle_manager_lib::db::Database;
use filevault_lifecycle_manager_lib::services::file_service::FileService;

fn make_file(root: &Path, rel: &str, contents: &str) {
    let full = root.join(rel);
    if let Some(parent) = full.parent() {
        fs::create_dir_all(parent).unwrap();
    }
    fs::write(full, contents).unwrap();
}

#[test]
fn scanner_inserts_then_updates_without_duplicating() {
    let tmp = tempdir();
    let root = tmp.path();

    make_file(root, "a.txt", "hello");
    make_file(root, "nested/b.txt", "world");
    make_file(root, "nested/deep/c.md", "# notes");

    // Place the database outside the scanned tree so we can verify
    // the MVP scanner (without skip_paths) still works correctly.
    let data_dir = tmp.path().join("data");
    fs::create_dir_all(&data_dir).unwrap();
    let db_path = data_dir.join("vault.db");
    let database = Database::open(&db_path).expect("open db");
    database.run_migrations().expect("migrate");
    let pool = database.pool().clone();
    let service = FileService::with_db_path(pool, db_path);

    // First scan — every file should be inserted.
    let first = rt().block_on(service.scan(root)).expect("scan 1");
    assert_eq!(first.total_seen, 3, "saw 3 files (no SQLite files picked up)");
    assert_eq!(first.inserted, 3, "inserted 3 rows");
    assert_eq!(first.updated, 0, "no updates on first scan");
    assert_eq!(first.errors, 0, "no errors");

    // Second scan — every file should be classified as updated, and
    // the table count must stay at 3.
    let second = rt().block_on(service.scan(root)).expect("scan 2");
    assert_eq!(second.total_seen, 3);
    assert_eq!(second.inserted, 0, "no new rows");
    assert_eq!(second.updated, 3, "all 3 marked as updated");
    assert_eq!(second.errors, 0);

    let stats = rt().block_on(service.aggregate_stats()).expect("stats");
    assert_eq!(stats.total, 3, "no duplicate rows");
    assert_eq!(stats.active, 3);
}

fn rt() -> tokio::runtime::Runtime {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("tokio runtime")
}

fn tempdir() -> tempdir::TempDir {
    tempdir::TempDir::new("filevault-scanner-test").expect("temp dir")
}
