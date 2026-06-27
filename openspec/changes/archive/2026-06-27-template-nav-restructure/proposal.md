## Why

The current template workspace uses a three-way mode switcher (Build / Preview / Data) that conflates unrelated concerns — schema setup and job management both live in "Data", and "Generate" is both a preview action and a batch submission trigger. As the product moves toward job-level batch management, this navigation needs a coherent information architecture before those surfaces are built.

## What Changes

### Jobs data model — **BREAKING**

The current `jobs` table is a single-record render entity (one payload → one PDF). This is the wrong abstraction. A job must be a first-class container for a set of records, with individual render tasks tracked as items within it.

**Current model (to be replaced):**
```
jobs            (id, template_id, user_id, status, payload JSONB, error_message, ...)
generated_documents (id, job_id UNIQUE FK, pdf_bytes, ...)
```

**New model:**
```
jobs            (id, template_id, user_id, name, status, is_active, total_count,
                 done_count, failed_count, created_at, completed_at)
job_items       (id, job_id FK, record_index, record_id, payload JSONB,
                 status, error_message, created_at, completed_at)
generated_documents (id, job_item_id UNIQUE FK, pdf_bytes, ...)   ← was job_id
```

Job `status` values: `draft` (loaded, not yet submitted) | `pending` | `processing` | `done` | `partial` (some items failed) | `failed`

Job item `status` values: `pending` | `processing` | `done` | `failed`

`is_active` is a per-template boolean — exactly one job per template is active at a time. A newly created job becomes active automatically. Any previous job can be made active manually.

A single-record generation (the current flow) becomes a job with one item — no special-casing.

Existing `jobs` rows are migrated: each becomes a `jobs` container record + one `job_items` row carrying the existing `payload`.

### Navigation and workspace

- **Tab rename and reorder**: Build/Preview/Data → Design / Data / Preview (in that order)
- **Design gains two legs**: Template (the Tiptap editor + right panel, as now) and Schema (schema upload, intent mapping, test data — currently all of "Data" tab)
- **Data tab becomes job management**: active job at the top with its record list; previous unarchived jobs below; "View full history" link to a full per-template job history page
- **Generate becomes an action, not a destination**: "Generate" CTA appears in Preview (current record or all) and per-row and as "Generate all" in the Data tab; the Generate slide-over panel is removed
- **Preview becomes a record navigator**: steps through records from the active job using WASM; ‹ N of N › navigation in the toolbar; Generate CTA to submit the active job

### Preview and field model

- **SVG preview with intent overlays**: Preview renders SVG (not PDF iframe); Fields mode shows intent chips as interactive overlays on the SVG; Data mode shows merged values; toggling is a frontend-only state change with no re-render
- **Natural language field expressions**: field intents gain an optional `expression` property (natural language → LLM → Liquid); covers format transforms ("show as month and year") and derived values ("sum of line items plus 20% tax"); Liquid is never user-facing
- **Derived field concept**: an expression that computes a value from multiple schema fields or aggregates an array, distinct from a simple format transform on a single `field_path`; stored as a dedicated intent variant

## Capabilities

### New Capabilities

- `job-management`: Job container + item data model (`jobs`, `job_items` tables); `is_active` per-template flag; `draft` status for pre-submission jobs; Data tab UI — active job record list, per-record and bulk Generate CTAs, status, download; previous jobs list; full history page; "make active" to promote a previous job
- `preview-record-navigation`: Preview tab — WASM render of active job records, ‹ N of N › navigation, Generate CTA, Fields/Data toggle
- `svg-preview`: SVG rendering path in WASM compiler alongside existing PDF; intent chip overlay layer in Fields mode; toggling between Fields and Data is a frontend-only state change
- `field-expressions`: natural language expression on field intents; LLM resolves to Liquid; covers format transforms and derived multi-field computations; `expression` property on `FrontendFieldIntent` and PT block model

### Modified Capabilities

- `template-canvas`: Design tab replaces Build tab; gains Template/Schema sub-navigation; schema sub-leg replaces current Data tab content
- `wasm-preview`: Preview tab replaces current preview mode; now renders SVG instead of PDF; record navigation added; connected to active job
- `live-preview-with-data`: DataSelector in preview toolbar replaced by active job / record navigation model; payload sourced from active job record, not ad-hoc test data picker
- `generate-api`: **BREAKING** — job endpoints restructured to reflect container+items model; `POST /api/templates/{id}/generate` replaced by job-level create and submit endpoints; `GET /api/jobs/{id}/download` becomes per-item or bulk ZIP; slide-over GenerateSheet removed; per-record and bulk Generate become inline CTAs

## Non-goals

- Does not implement multi-record parallel rendering — job items are still rendered sequentially via `tokio::spawn`; true parallel batch pipeline is Phase 2
- Does not introduce a global jobs view across templates — per-template history only; top-level nav entry is Phase 2/3
- Does not change the Typst server-side render path — SVG preview is WASM/browser only
- Does not implement condition-sets or field-sets (flagged as future intent extensions)
- Does not implement CSV upload as a job input method — JSON array paste only for this change; CSV is Phase 2

## Impact

- `apps/web/src/pages/TemplatePage.tsx` — tab structure, mode names, routing
- `apps/web/src/components/PreviewPane.tsx` — WASM SVG render, record navigation, Fields/Data toggle
- `apps/web/src/components/DataPane.tsx` — split into Schema sub-tab and job management surface
- `apps/web/src/components/GenerateSheet.tsx` — removed; Generate becomes inline CTAs
- `crates/typst-compiler/src/wasm.rs` — add `render_preview_svg` / `render_preview_with_data_svg` exports
- `crates/typst-compiler/src/frontend_model.rs` — add `expression: Option<String>` to `FrontendFieldIntent`; add derived field variant
- DB migrations — new `job_items` table; add `name`, `is_active`, `total_count`, `done_count`, `failed_count`, `completed_at` to `jobs`; remove `payload` from `jobs`; alter `generated_documents.job_id` → `job_item_id`; migrate existing rows
- `apps/api/src/jobs/` — restructured handlers for container+items model; new endpoints for job create, item submit, item download, job ZIP download, active-job management
- `apps/web/src/lib/api.ts` — job management API types; SVG render helpers
- New page: full job history per template (`/app/templates/:id/history` or similar)

## Phase

Phase 1 — completes the template workspace UX before Phase 2 batch work begins.
