-- Make `original_path` the stable identity for a file across scans.
-- A partial unique index lets us keep multiple tombstones (status = deleted)
-- for the same path if we ever need to, while still preventing duplicate
-- active rows for a given path.

CREATE UNIQUE INDEX IF NOT EXISTS uq_files_original_path_active
    ON files(original_path)
    WHERE status != 'deleted';
