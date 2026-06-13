//! Core domain logic. Lower level than services — these modules hold
//! the algorithms (scanning, hashing, archiving, dedup). Services
//! compose them; commands expose them to the UI.

pub mod archive;
pub mod duplicate_detector;
pub mod file_lifecycle;
pub mod scan_controller;
pub mod scanner;
pub mod trash;
