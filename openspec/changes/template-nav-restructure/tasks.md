# Tasks — template-nav-restructure

## 1. Database migrations

- [x] 1.1 Write migration to restructure the `jobs` table: add `name TEXT`, `is_active BOOLEAN NOT NULL DEFAULT false`, `total_count INT NOT NULL DEFAULT 1`, `done_count INT NOT NULL DEFAULT 0`, `failed_count INT NOT NULL DEFAULT 0`, `completed_at TIMESTAMPTZ`; update `status` CHECK to include `draft` and `partial`. **AC:** `cargo sqlx migrate run` succeeds; existing rows are unaffected.

- [x] 1.2 Write migration to create the `job_items` table: `id UUID PK`, `job_id UUID FK jobs(id) ON DELETE CASCADE`, `record_index INT NOT NULL`, `record_id TEXT`, `payload JSONB NOT NULL`, `status TEXT CHECK(loaded|queued|processing|done|failed) NOT NULL DEFAULT 'loaded'`, `error_message TEXT`, `created_at`, `completed_at`. **AC:** table exists; FK constraint present.

- [x] 1.3 Write migration to migrate existing data: for each `jobs` row, insert one `job_items` row (`record_index = 0`, `payload` from `jobs.payload`, `status` mapped from job status); alter `generated_documents.job_id` → `job_item_id` (FK → `job_items(id)`); backfill `done_count`/`failed_count` on `jobs`; set `is_active = true` for most recent job per `template_id`; drop `payload` and `error_message` from `jobs`; add partial unique index `jobs_one_active_per_template ON jobs(template_id) WHERE is_active = true`. **AC:** all existing job data accessible via new model; `generated_documents` FK resolves correctly.

## 2. Backend — job model and API

- [x] 2.1 Update `jobs` Rust model structs to match new schema: add `name`, `is_active`, `total_count`, `done_count`, `failed_count`, `completed_at`; remove `payload` and `error_message`. Add `JobItem` struct with all `job_items` columns. **AC:** `cargo build` clean; sqlx offline query cache updated.

- [x] 2.2 Implement `POST /api/templates/{id}/jobs`: validate all records against schema (return 422 with per-record errors on failure); create `jobs` row with auto-generated name ("Job N") and `status: draft`; insert one `job_items` row per record with `status: loaded`; set new job as active (deactivate previous in transaction); return `201 { job_id, item_count }`. **AC:** valid array creates job+items and sets active; invalid records return 422 with correct per-record error shape.

- [x] 2.3 Implement `POST /api/jobs/{id}/submit`: set all `loaded` items to `queued`; spawn a `tokio::spawn` render task per item (reusing existing render logic from `render.rs`); update job status to `pending`; return `202 { queued: N }`. **AC:** all loaded items transition to queued; render tasks fire; job status updates correctly.

- [x] 2.4 Implement `POST /api/jobs/{id}/items/{item_id}/submit`: submit a single `loaded` item to the render queue; update job status from `draft` to `processing` if not already; return `202`. **AC:** single item queued; other items unaffected.

- [x] 2.5 Update `GET /api/jobs/{id}` to return job container + item list: `{ id, name, status, is_active, total_count, done_count, failed_count, created_at, completed_at, items: [{ id, record_index, record_id, status, error_message }] }`. Remove `download_url` from response. **AC:** response matches new shape; all items listed.

- [x] 2.6 Implement `GET /api/jobs/{id}/items/{item_id}/download`: stream `generated_documents.pdf_bytes` for the given `job_item_id`; return `404` if not found or not owned; return `409` if item status is not `done`. **AC:** completed item streams PDF; pending item returns 409.

- [x] 2.7 Update `GET /api/jobs/{id}/download` to stream a ZIP of all completed items using the `zip` crate: one entry per `done` item, named `{record_id}.pdf` or `record_{index}.pdf`; return `409` if no items are done. **AC:** ZIP contains one PDF per done item with correct filenames; 409 when nothing done.

- [x] 2.8 Implement `PATCH /api/jobs/{id}/active`: in a single transaction, set `is_active = false` for the current active job of this template, `is_active = true` for the given job; return `200 { job_id }`. **AC:** partial unique index prevents two active jobs; transaction rolls back if constraint violated.

- [x] 2.9 Update `render.rs` render job to operate on `job_items`: read `payload` from `job_item`, write `generated_documents.job_item_id`; increment `done_count` or `failed_count` on parent job atomically; set job status to `done`/`partial`/`failed` when all items complete. **AC:** render task completes; job aggregate counts update correctly; `generated_documents` row references `job_item_id`.

- [x] 2.10 Remove `POST /api/templates/{id}/generate` endpoint and the `GenerateHandler` that served it. **AC:** endpoint returns 404; no dead code remains; existing tests removed or updated.

## 3. WASM — SVG rendering

- [x] 3.1 Add `render_preview_svg(blocks_json, stylesheet_json, font_data) -> Result<Vec<String>, JsValue>` export to `crates/typst-compiler/src/wasm.rs`: call `typst::export::svg` (one SVG string per page); return `Vec<String>`. **AC:** function exported; calling it with a simple block model returns at least one valid `<svg>` string.

- [x] 3.2 Add `render_preview_with_data_svg(blocks_json, stylesheet_json, data_json, font_data) -> Result<Vec<String>, JsValue>` export: same as above but injects `data.json` into the `InMemoryWorld` as with the existing `render_preview_with_data`. **AC:** field merge values appear in returned SVG when data payload is provided.

- [x] 3.3 Rebuild the WASM package (`wasm-pack build --features wasm` — no `--target` flag) and verify `typst_compiler_bg.js` is present in `crates/typst-compiler/pkg/`. **AC:** `apps/web` build succeeds with updated pkg; no `__wbindgen_malloc` errors in browser console.

## 4. Compiler — field expressions

- [x] 4.1 Add `expression: Option<String>` and `expression_label: Option<String>` to `FrontendFieldIntent` in `frontend_model.rs`. Add `DerivedFieldIntent { expression_label: String, expression: Option<String> }` variant to `FrontendChild`. Update `map_child` to handle the derived field variant (emit expression as a Typst literal placeholder; unresolved derived fields emit `[expression_label]`). **AC:** Rust tests pass; new variants round-trip through `serde_json`.

- [x] 4.2 Update `map_child` for `FieldIntent` with `expression` set: when `expression` is `Some`, record that the expression must be evaluated server-side and emit a uniquely keyed placeholder string in the Typst source (e.g. `"__expr_<key>__"`). Add a post-compilation expression substitution step in the server render pipeline that evaluates the Liquid expression against the payload and replaces the placeholder with the computed value. **AC:** a field intent with `expression: "amount | divided_by: 100.0"` and a payload `{ "amount": 9780 }` produces `97.8` in the generated PDF.

## 5. Frontend — navigation restructure

- [x] 5.1 Rename `mode` state values in `TemplatePage.tsx`: `"build"` → `"design-template"`, `"preview"` → `"preview"`, `"data"` → `"data"`. Add a `designSubTab: "template" | "schema"` state. Replace the three-button toggle in the header with a tab bar: Design (with Template/Schema sub-tabs), Data, Preview. **AC:** tabs render in correct order; Design tab defaults to Template sub-tab; switching tabs shows correct content.

- [x] 5.2 Move the schema/mapping/test-data content (currently rendered when `mode === "data"`) to render when `mode === "design-template"` and `designSubTab === "schema"`. The `DataPane` schema surfaces move under Design → Schema. **AC:** Design → Schema shows schema upload, mappings table, and test data; Data tab no longer shows schema content.

- [x] 5.3 Auto-collapse the right panel when switching to Data or Preview (preserve existing behaviour); restore on return to Design. **AC:** switching to Data or Preview collapses the panel; returning to Design restores previous collapsed state.

- [x] 5.4 Update page title, breadcrumb, and any other references to the old mode names ("Build", "Preview", "Data" as the previous three-way toggle) throughout the codebase. **AC:** `grep -r '"build"'` in `apps/web/src` finds no remaining mode references to the old values; UI shows correct labels.

## 6. Frontend — Data tab job management UI

- [x] 6.1 Create a `JobPane` component (replaces the job management surface in the Data tab): fetch the active job via `GET /api/jobs?template_id={id}&active=true` (or derive from template query); render the active job header (name, record count, date) and record list; show empty state with "+ New job" button when no active job. **AC:** active job header and record list render; empty state shows when no job.

- [x] 6.2 Implement the "+ New job" / dataset input flow in `JobPane`: a textarea for JSON array paste and a "Load" button; validate client-side that input is a JSON array; call `POST /api/templates/{id}/jobs`; on success show the new job's record list; on 422 show per-record validation errors inline. **AC:** valid JSON array creates job and shows record list; invalid input shows errors without creating a job.

- [x] 6.3 Implement per-record row in the record list: show `record_index`, status indicator (dot or badge), and context-appropriate action buttons: "Generate" (when `loaded`), download link (when `done`), "Retry" + error detail (when `failed`), spinner (when `queued`/`processing`). **AC:** each status variant renders correctly; Generate and download buttons call correct endpoints.

- [x] 6.4 Implement "Generate all" CTA in `JobPane`: visible when at least one item is `loaded`; calls `POST /api/jobs/{id}/submit`; button text updates to "Generating…" while in flight; polls `GET /api/jobs/{id}` every 2s until no items are `queued` or `processing`. **AC:** Generate all submits all loaded items; progress updates live.

- [x] 6.5 Implement previous jobs list below the active job: fetch all jobs for the template; render each non-active job as a compact row (name, date, status, counts, download link for done jobs); "···" menu with "Make active" (calls `PATCH /api/jobs/{id}/active`) and "Archive" (Phase 2 stub). **AC:** previous jobs listed; Make active swaps active job and updates UI.

- [x] 6.6 Create the job history page at `/app/templates/:id/jobs`: lists all jobs for the template in reverse-chronological order (name, date, status, record count, download); linked from "View full history →" in `JobPane`. **AC:** page renders and lists all jobs; download links work for completed jobs.

## 7. Frontend — Preview tab SVG + record navigation

- [x] 7.1 Update `wasmPreview.ts`: add `renderPreviewSvg(blocks, stylesheet): Promise<string[]>` and `renderPreviewWithDataSvg(blocks, stylesheet, payload): Promise<string[]>` calling the new WASM exports. **AC:** functions return arrays of SVG strings; TypeScript types are correct.

- [x] 7.2 Replace the PDF iframe in `PreviewPane.tsx` with an SVG renderer: call `renderPreviewSvg` or `renderPreviewWithDataSvg` based on whether a record is selected; render each returned SVG string as an `<img src="data:image/svg+xml;...">` or `<div dangerouslySetInnerHTML>` in a vertically stacked layout with page gaps. **AC:** template renders as SVG in Preview; multi-page documents stack vertically.

- [x] 7.3 Add record navigator to the `PreviewPane` toolbar: `‹ Record N of M ›` controls; fetch active job items from `GET /api/jobs/{id}`; on ‹/› click update selected record index and re-render WASM with that item's payload; disable ‹ at index 0 and › at last index. **AC:** navigator shows correct position; stepping through records triggers re-render with correct payload.

- [x] 7.4 Add Fields/Data toggle to the `PreviewPane` toolbar: in Fields mode show the SVG with an overlay layer (populated in task 7.5); in Data mode hide the overlay; toggle is instant (no WASM re-render). **AC:** toggle switches instantly; no WASM call is triggered on toggle.

- [ ] 7.5 Implement the intent chip overlay layer in Fields mode: after SVG render, parse the returned SVG to locate field intent elements (by a data attribute or element ID set during Typst compilation); position overlay chips absolutely over the SVG using the element bounding boxes; clicking a chip opens an intent popover. **Note: this task requires a spike to determine how Typst SVG identifies intent positions — may need a custom Typst marker approach.** **AC:** at least one intent chip renders over its correct position in the SVG.

- [x] 7.6 Add Generate CTAs to the `PreviewPane` toolbar: "Generate this record" (calls `POST /api/jobs/{id}/items/{item_id}/submit` for the current record) and "Generate all" (calls `POST /api/jobs/{id}/submit`); both disabled when all items already submitted. **AC:** Generate this record submits only the current item; Generate all submits all; buttons disable correctly.

## 8. Remove GenerateSheet and old generate button

- [x] 8.1 Delete `apps/web/src/components/GenerateSheet.tsx` and remove all imports and references to it in `TemplatePage.tsx`. Remove the "Generate" `<Button>` from the template header. **AC:** no TypeScript errors; no GenerateSheet import remains; template header no longer has a Generate button.

- [x] 8.2 Remove the `DataSelector` component from `PreviewPane` and all imports and callers. Remove `generateDocument`, `getJob`, `getJobDownloadUrl` from `api.ts` (these are replaced by the new job-level API functions). **AC:** no TypeScript errors; no DataSelector references remain.

## 9. Frontend — field expression UI

- [x] 9.1 Add an expression section to the field intent chip popover in `BlockCanvas` (the editor-side popover): a natural language text input labelled "Format or compute"; a "Resolve" button; on click call a new `POST /api/templates/{id}/intents/resolve-expression` endpoint (to be created) with the field path, field type from schema, and natural language text; on success store `expression` and `expression_label` on the intent node and show the `ƒ` indicator on the chip. **AC:** entering "show as month and year" for a date field triggers LLM resolution; chip shows `ƒ` indicator after success.

- [x] 9.2 Add the backend endpoint `POST /api/templates/{id}/intents/resolve-expression`: accept `{ field_path, field_type, description }`, call Qwen3-8B (no_think) to generate a Liquid expression, validate the output is syntactically valid Liquid, return `{ expression, expression_label }`. Return 422 if the LLM output is not valid Liquid. **AC:** valid natural language descriptions return a Liquid expression; invalid/unparseable LLM output returns 422.

- [ ] 9.3 Show the `ƒ` indicator and raw value hint in the Preview tab overlay: when a field intent chip in the SVG overlay has `expression` set, render the chip with a `ƒ` suffix; in Data mode, show the raw field value with a `ƒ` indicator and a tooltip "Format applied in generated PDF". **AC:** chips with expressions display `ƒ`; tooltip is shown in Data mode.
