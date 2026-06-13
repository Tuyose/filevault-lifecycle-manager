CREATE TABLE IF NOT EXISTS analytics_snapshots (
    id              TEXT PRIMARY KEY,
    created_at      TEXT NOT NULL,
    tracked_files   INTEGER NOT NULL,
    total_size_bytes  INTEGER NOT NULL,
    duplicate_groups  INTEGER NOT NULL,
    duplicate_files   INTEGER NOT NULL,
    reclaimable_bytes INTEGER NOT NULL,
    health_score    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_analytics_created_at
ON analytics_snapshots(created_at);
