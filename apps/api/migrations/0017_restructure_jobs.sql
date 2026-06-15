-- Add new columns to jobs
ALTER TABLE jobs
    ADD COLUMN name TEXT,
    ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN total_count INT NOT NULL DEFAULT 1,
    ADD COLUMN done_count INT NOT NULL DEFAULT 0,
    ADD COLUMN failed_count INT NOT NULL DEFAULT 0;

-- Widen status CHECK to include 'draft' and 'partial'
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_status_check
    CHECK (status IN ('draft', 'pending', 'processing', 'done', 'partial', 'failed'));
