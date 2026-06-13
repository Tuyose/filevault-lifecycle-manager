//! Domain types shared across the app. They are pure data + behaviour
//! for serialising to / from the database; no I/O lives here.

pub mod analytics_snapshot;
pub mod app_settings;
pub mod duplicate_group;
pub mod file_record;
pub mod lifecycle_event;
pub mod scan_run;
pub mod watch_folder;
