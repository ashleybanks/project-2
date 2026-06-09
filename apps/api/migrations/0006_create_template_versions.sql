CREATE TABLE template_versions (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID        NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    block_model JSONB       NOT NULL,
    label       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX template_versions_template_id_idx ON template_versions(template_id);
