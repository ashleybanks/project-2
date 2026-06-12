# Tasks: Template Schema

## Backend

- [x] DB migration: `template_schemas` table (`id`, `template_id`, `raw_schema` jsonb, `created_at`)
- [x] DB migration: `intent_mappings` table (`id`, `schema_id`, `intent_key`, `intent_label`, `intent_type`, `display_name`, `field_path`, `confidence`, `alternatives`, `parent_key`)
- [x] API: `POST /api/templates/{id}/schema` — validate and store schema, trigger async resolution
- [x] API: `GET /api/templates/{id}/schema` — return schema metadata + all intent mappings
- [x] API: `DELETE /api/templates/{id}/schema` — remove schema and all mappings
- [x] Intent extractor: walk block model, return structured intent list with `parent_key` context
- [x] LLM resolution service: all-in-one pass (full intent list + schema → mapping array)
- [x] LLM resolution service: selective pass (single intent + existing mappings as context → one mapping)
- [x] Block model write-back: update `field_path`, `display_name`, `collection_path` on intent nodes after resolution; save template
- [x] API: `POST /api/templates/{id}/schema/resolve` — trigger resolution (all-in-one or selective via `intent_key` body param); `202 Accepted`
- [x] Conflict detection: post-resolution check for duplicate `field_path`; flag both as `confidence: low`
- [x] API: `POST /api/templates/{id}/schema/test-data` — generate N records from raw schema using faker library
- [ ] Auto-trigger selective resolution when a new intent is added or an intent label is changed on save

## Frontend — Data tab

- [x] Schema upload area: empty state with upload button, file validation, upload error display
- [x] Schema upload area: uploaded state showing filename, field count, uploaded date, Replace and View buttons
- [x] View schema modal: read-only JSON code viewer
- [x] Replace schema: confirm prompt before overwriting
- [x] Mappings area: loading/resolving state
- [x] Mappings area: resolved table with confidence indicators, intent type prefixes, nested indent
- [x] Mappings area: inline alternatives display for medium/low confidence rows
- [x] Mappings area: Change/Fix dropdown (alternatives list + field search + manual path entry)
- [x] Mappings area: per-row retry (selective re-resolution)
- [x] Mappings area: Re-resolve all with confirm prompt
- [x] Test data area: hidden until schema exists; generate button; loading state
- [x] Test data area: results table with root-level columns; array field expand toggle; Regenerate; Export JSON

## Frontend — Build tab

- [x] Intent chip: add resolution status indicator based on `confidence`
- [x] Intent chip: switch displayed label to `display_name` when resolved
- [x] Intent popover: add resolution section (field path, type, confidence, alternatives) when schema exists
- [x] Intent popover: Change dropdown (same as mapping area)
- [x] Intent popover: Retry button triggering selective re-resolution
- [x] Intent popover: Data tab link — switch to Data tab
- [x] Intent popover: unresolved state with Fix in Data tab link
- [x] Intent popover: no resolution section shown when template has no schema
