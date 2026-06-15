-- 1. Create job_items rows from existing jobs
INSERT INTO job_items (job_id, record_index, payload, status, created_at, completed_at)
SELECT
    j.id,
    0,
    j.payload,
    CASE
        WHEN EXISTS (SELECT 1 FROM generated_documents gd WHERE gd.job_id = j.id) THEN 'done'
        WHEN j.status = 'failed' THEN 'failed'
        ELSE 'loaded'
    END,
    j.created_at,
    j.completed_at
FROM jobs j;

-- 2. Add job_item_id column to generated_documents (nullable initially)
ALTER TABLE generated_documents ADD COLUMN job_item_id UUID;

-- 3. Populate job_item_id by joining through job_items
UPDATE generated_documents gd
SET job_item_id = ji.id
FROM job_items ji
WHERE ji.job_id = gd.job_id
  AND ji.record_index = 0;

-- 4. Drop old job_id FK column; constrain job_item_id
ALTER TABLE generated_documents DROP COLUMN job_id;
ALTER TABLE generated_documents ALTER COLUMN job_item_id SET NOT NULL;
ALTER TABLE generated_documents ADD CONSTRAINT generated_documents_job_item_id_key UNIQUE (job_item_id);
ALTER TABLE generated_documents ADD CONSTRAINT generated_documents_job_item_id_fkey
    FOREIGN KEY (job_item_id) REFERENCES job_items(id) ON DELETE CASCADE;

-- 5. Backfill done_count and failed_count on jobs
UPDATE jobs j
SET
    done_count   = (SELECT COUNT(*) FROM job_items ji WHERE ji.job_id = j.id AND ji.status = 'done'),
    failed_count = (SELECT COUNT(*) FROM job_items ji WHERE ji.job_id = j.id AND ji.status = 'failed');

-- 6. Backfill job names as "Job N" (1-based rank by created_at per template)
UPDATE jobs j
SET name = 'Job ' || rn.row_num
FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY template_id ORDER BY created_at) AS row_num
    FROM jobs
) rn
WHERE j.id = rn.id;

ALTER TABLE jobs ALTER COLUMN name SET NOT NULL;

-- 7. Set is_active = true for the most recent job per template
UPDATE jobs j
SET is_active = true
FROM (
    SELECT DISTINCT ON (template_id) id
    FROM jobs
    ORDER BY template_id, created_at DESC
) latest
WHERE j.id = latest.id;

-- 8. Add partial unique index enforcing one active job per template
CREATE UNIQUE INDEX jobs_one_active_per_template
    ON jobs (template_id)
    WHERE is_active = true;

-- 9. Drop payload and error_message from jobs (now on job_items)
ALTER TABLE jobs DROP COLUMN payload;
ALTER TABLE jobs DROP COLUMN error_message;
