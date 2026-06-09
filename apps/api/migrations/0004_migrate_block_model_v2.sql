-- Migrate block model from project-block wrapper format to PT-extended format.
-- old text:    { "type": "text", "content": [...], "conditionIntent"?: ..., "repeatIntent"?: ... }
-- new section: { "_type": "section", "_key": "...", "content": [...], "conditionIntent"?: ..., "repeatIntent"?: ... }
-- old divider: { "type": "divider" }
-- new divider: { "_type": "block", "_key": "...", "style": "divider", "children": [] }
-- Idempotent: blocks already carrying "_type" are passed through unchanged.

UPDATE templates
SET block_model = jsonb_build_object(
    'blocks',
    (
        SELECT jsonb_agg(
            CASE
                WHEN block->>'type' = 'text' THEN
                    jsonb_strip_nulls(jsonb_build_object(
                        '_type',           'section',
                        '_key',            COALESCE(block->>'_key', gen_random_uuid()::text),
                        'content',
                            CASE
                                WHEN jsonb_typeof(block->'content') = 'array'
                                THEN block->'content'
                                ELSE jsonb_build_array(block->'content')
                            END,
                        'conditionIntent', block->'conditionIntent',
                        'repeatIntent',    block->'repeatIntent'
                    ))
                WHEN block->>'type' = 'divider' THEN
                    jsonb_build_object(
                        '_type',    'block',
                        '_key',     COALESCE(block->>'_key', gen_random_uuid()::text),
                        'style',    'divider',
                        'children', '[]'::jsonb
                    )
                ELSE block
            END
        )
        FROM jsonb_array_elements(block_model->'blocks') AS block
    )
)
WHERE block_model->'blocks' IS NOT NULL
  AND jsonb_array_length(block_model->'blocks') > 0;
