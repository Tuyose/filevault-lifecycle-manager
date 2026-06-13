-- Persist scan runs so the user can review past indexing sessions.
-- A new row is written after every scan completes, is cancelled, or
-- encounters a fatal error.

CREATE TABLE IF NOT EXISTS scan_runs (
    id          TEXT PRIMARY KEY,
    root_path   TEXT NOT NULL,
    started_at  TEXT NOT NULL,
    finished_at TEXT NOT NULL,
    total_seen  INTEGER NOT NULL,
    inserted    INTEGER NOT NULL,
    updated     INTEGER NOT NULL,
    errors      INTEGER NOT NULL,
    total_bytes INTEGER NOT NULL,
    status      TEXT NOT NULL CHECK (status IN ('completed', 'cancelled', 'error'))
);

CREATE INDEX IF NOT EXISTS idx_scan_runs_finished_at ON scan_runs(finished_at DESC);
