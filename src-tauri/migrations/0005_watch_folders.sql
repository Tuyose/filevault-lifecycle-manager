CREATE TABLE IF NOT EXISTS watch_folders (
    id              TEXT PRIMARY KEY,
    path            TEXT NOT NULL UNIQUE,
    label           TEXT NOT NULL,
    enabled         INTEGER NOT NULL DEFAULT 1,
    frequency       TEXT NOT NULL DEFAULT 'weekly'
                        CHECK (frequency IN ('daily', 'weekly', 'monthly')),
    preferred_weekday INTEGER,
    preferred_hour  INTEGER NOT NULL DEFAULT 20,
    preferred_minute INTEGER NOT NULL DEFAULT 0,
    last_scan_at    TEXT,
    next_scan_at    TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_watch_folders_enabled  ON watch_folders(enabled);
CREATE INDEX IF NOT EXISTS idx_watch_folders_next_scan ON watch_folders(next_scan_at);
