//! Integration test for BLAKE3 hashing + duplicate detection.
//!
//! Creates 3 files in a temp dir:
//!   - a.txt  (content "abc")
//!   - b.txt  (content "abc")  ← duplicate of a
//!   - c.txt  (content "xyz")  ← unique
//!
//! After scanning, asserts that the duplicate group query returns:
//!   - 1 group
//!   - 2 duplicate files
//!   - 1 hash

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
fn duplicate_detection_finds_identical_content() {
    let tmp = tempdir();
    let root = tmp.path();

    // a and b share content "abc", c is different
    make_file(root, "a.txt", "abc");
    make_file(root, "b.txt", "abc");
    make_file(root, "c.txt", "xyz");

    let data_dir = tmp.path().join("data");
    fs::create_dir_all(&data_dir).unwrap();
    let db_path = data_dir.join("vault.db");
    let database = Database::open(&db_path).expect("open db");
    database.run_migrations().expect("migrate");
    let pool = database.pool().clone();
    let service = FileService::with_db_path(pool, db_path);

    let summary = rt().block_on(service.scan(root)).expect("scan");
    assert_eq!(summary.total_seen, 3, "all 3 files seen");
    assert_eq!(summary.errors, 0, "no errors (hashing included)");

    let stats = rt().block_on(service.aggregate_stats()).expect("stats");
    assert_eq!(stats.total, 3, "3 rows in files table");
    assert_eq!(stats.active, 3);

    // Query duplicate groups
    let groups = rt()
        .block_on(service.repository().find_duplicate_groups())
        .expect("duplicate groups");
    assert_eq!(groups.len(), 1, "exactly 1 duplicate group");

    let group = &groups[0];
    assert_eq!(group.total_files, 2, "2 files in the group");
    assert_eq!(group.files.len(), 2);

    // Both files should be the same length (3 bytes each)
    assert_eq!(group.files[0].size_bytes, 3);
    assert_eq!(group.files[1].size_bytes, 3);

    // Wasted bytes: total 6, but could keep 1 file (3 bytes), so 3 reclaimable
    assert_eq!(group.total_wasted_bytes, 6, "a+b = 6 bytes total");

    // Verify c.txt is NOT in any group (unique content)
    let c_in_group = group.files.iter().any(|f| f.path.contains("c.txt"));
    assert!(!c_in_group, "c.txt is unique and should not appear");
}

fn rt() -> tokio::runtime::Runtime {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("tokio runtime")
}

fn tempdir() -> tempdir::TempDir {
    tempdir::TempDir::new("filevault-duplicate-test").expect("temp dir")
}
