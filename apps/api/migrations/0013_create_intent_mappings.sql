CREATE TYPE intent_type AS ENUM ('field', 'repeat', 'condition');
CREATE TYPE mapping_confidence AS ENUM ('high', 'medium', 'low', 'unresolved');

CREATE TABLE intent_mappings (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schema_id    UUID NOT NULL REFERENCES template_schemas(id) ON DELETE CASCADE,
    intent_key   TEXT NOT NULL,
    intent_label TEXT NOT NULL,
    intent_type  intent_type NOT NULL,
    display_name TEXT NOT NULL DEFAULT '',
    field_path   TEXT,
    confidence   mapping_confidence NOT NULL DEFAULT 'unresolved',
    alternatives TEXT[] NOT NULL DEFAULT '{}',
    parent_key   TEXT,
    UNIQUE (schema_id, intent_key)
);
