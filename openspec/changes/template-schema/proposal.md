# Proposal: Template Schema

## What and why

Templates contain intent annotations — `fieldIntent`, `conditionIntent`, `repeatIntent` — expressed as natural language labels ("customer's full name", "one row per line item"). These labels describe *what* data the template needs, but the system has no structured representation of that data shape.

The template schema is a versioned, machine-readable artifact that bridges template intents and actual data. Without it, none of the data screen features can be built: no test data generation, no XLSX export, no merge-time validation, no field autocomplete, no integration API contract.

This change introduces the schema as a first-class artifact, scoped to the minimum viable foundation: upload a JSON schema, resolve template intents to schema field paths using LLM, surface the mappings with confidence scores in the Data tab, and generate sample records to validate the setup.

## Scope

1. **JSON schema upload** — user uploads a `.json` file (JSON Schema draft-07) in the Data tab
2. **Schema storage** — schema entity stored and linked to the template
3. **LLM intent resolution** — all-in-one pass maps every intent to a schema field path, with confidence score and alternatives
4. **Selective re-resolution** — individual intents can be re-resolved after the initial pass
5. **Mapping area in Data tab** — dedicated section showing all intent→field mappings with confidence scores and inline editing
6. **Build tab integration** — intent chips reflect resolved/unresolved state; inspection popover shows mapping detail and links to Data tab
7. **Test data generation** — generate N records (default 10) from the schema; displayed as a preview table in the Data tab

## Explicitly deferred

- Intent-first schema derivation (schema from block model intents, no upload required)
- XLSX download/upload paths
- Batch/submission model and PDF generation
- Preview tab integration (merged documents)
- PDF download
- Sample data upload for schema type/enum enrichment
- JSON Schema export API (`GET /templates/{id}/schema`)
- Webhook and API integration tier

## Key decisions

- **Schema is uploaded** in this change — not derived from intents. Intent-first derivation comes in a later change.
- **Resolution is background + ambient** — no blocking confirmation step. Confidence scores surface uncertainty without interrupting the flow.
- **All-in-one LLM pass** resolves all intents together to benefit from structural context: nested field intents inside a repeat section resolve relative to the array item schema, not the root.
- **Selective re-resolution** targets one intent but passes all existing mappings as context, so the LLM can avoid conflicts.
- **Test data** in this change is a preview table only — not a batch, not merged PDFs. Persisted batches come in a later change.
- **Field path is stored in two places**: on the intent node in the block model (for Typst compilation) and in a separate mapping entity (for UI metadata: confidence, alternatives, display name). The mapping entity is source of truth; the block model carries the denormalized resolved value.
