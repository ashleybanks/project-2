CREATE TABLE templates (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT        NOT NULL,
    block_model JSONB       NOT NULL DEFAULT '{"blocks":[]}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX templates_user_id_idx ON templates(user_id);
CREATE INDEX templates_block_model_gin ON templates USING GIN(block_model);
