ALTER TABLE jobs ADD COLUMN archived BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_status_check
    CHECK (status IN ('draft', 'pending', 'processing', 'done', 'partial', 'failed', 'cancelled'));
