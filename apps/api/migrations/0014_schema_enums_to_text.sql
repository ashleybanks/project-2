-- Convert custom enum columns to TEXT + CHECK for sqlx compatibility

ALTER TABLE intent_mappings
    ALTER COLUMN intent_type  TYPE TEXT USING intent_type::text,
    ALTER COLUMN confidence   TYPE TEXT USING confidence::text;

ALTER TABLE intent_mappings
    ADD CONSTRAINT intent_type_check
        CHECK (intent_type IN ('field', 'repeat', 'condition')),
    ADD CONSTRAINT confidence_check
        CHECK (confidence IN ('high', 'medium', 'low', 'unresolved'));

ALTER TABLE intent_mappings
    ALTER COLUMN confidence SET DEFAULT 'unresolved';

DROP TYPE IF EXISTS intent_type;
DROP TYPE IF EXISTS mapping_confidence;
