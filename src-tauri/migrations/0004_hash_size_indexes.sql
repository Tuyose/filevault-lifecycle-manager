-- Indexes to accelerate duplicate detection queries.

-- The 0001 migration already defines idx_files_hash, but it may not
-- exist if someone started fresh after the MVP migration was merged.
-- This statement is idempotent.
CREATE INDEX IF NOT EXISTS idx_files_hash ON files(hash);
CREATE INDEX IF NOT EXISTS idx_files_size ON files(size_bytes);
