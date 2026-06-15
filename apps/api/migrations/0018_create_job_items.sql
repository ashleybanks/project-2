CREATE TABLE job_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    record_index INT NOT NULL,
    record_id TEXT,
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'loaded'
        CHECK (status IN ('loaded', 'queued', 'processing', 'done', 'failed')),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX job_items_job_id_idx ON job_items(job_id);
