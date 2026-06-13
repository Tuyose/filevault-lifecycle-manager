-- FileVault Lifecycle Manager — initial schema
-- Mirrors the file lifecycle: active → archived / trashed / deleted,
-- with a per-event audit log and a generic key/value settings store.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS files (
    id              TEXT PRIMARY KEY,
    original_path   TEXT NOT NULL,
    current_path    TEXT NOT NULL,
    file_name       TEXT NOT NULL,
    extension       TEXT,
    size_bytes      INTEGER NOT NULL,
    hash            TEXT,
    status          TEXT NOT NULL CHECK (status IN ('active', 'archived', 'trashed', 'deleted')),
    created_at      TEXT NOT NULL,
    modified_at     TEXT,
    last_seen_at    TEXT NOT NULL,
    archived_at     TEXT,
    trashed_at      TEXT,
    deleted_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_files_status          ON files(status);
CREATE INDEX IF NOT EXISTS idx_files_hash            ON files(hash);
CREATE INDEX IF NOT EXISTS idx_files_last_seen_at    ON files(last_seen_at);

CREATE TABLE IF NOT EXISTS lifecycle_events (
    id              TEXT PRIMARY KEY,
    file_id         TEXT NOT NULL,
    event_type      TEXT NOT NULL CHECK (event_type IN
                       ('discovered','hashed','archived','restored','trashed','purged','updated')),
    from_path       TEXT,
    to_path         TEXT,
    created_at      TEXT NOT NULL,
    metadata_json   TEXT,
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_lifecycle_events_file_id    ON lifecycle_events(file_id);
CREATE INDEX IF NOT EXISTS idx_lifecycle_events_created_at ON lifecycle_events(created_at);

CREATE TABLE IF NOT EXISTS app_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
