## Context

The template workspace currently has three modes (Build / Preview / Data) controlled by a toggle in the header. "Data" conflates schema setup (one-time design activity) with job management (ongoing operational activity). "Generate" is both a preview action and a server-side submission trigger. The existing `jobs` table models a single-record render, not a multi-record job container. This design establishes the correct data model and workspace structure before batch generation work begins in Phase 2.

**Current state:**
- `jobs` table: one row per single-document render (`payload JSONB` on the job itself)
- `generated_documents`: one row per job (`job_id UNIQUE FK`)
- Preview renders PDF in an iframe via WASM
- DataSelector in preview toolbar lets user pick test data ad-hoc
- GenerateSheet slide-over panel handles submission

## Goals / Non-Goals

**Goals:**
- Establish `jobs` as a container entity with `job_items` as individual render tasks
- Migrate existing single-render jobs without data loss
- Restructure the workspace into Design / Data / Preview with clean separation of concerns
- Replace PDF iframe preview with SVG + intent overlay layer
- Connect Preview to the active job's record set
- Add `expression` to field intents for natural language → Liquid field formatting and derived values

**Non-Goals:**
- Parallel batch rendering (Phase 2)
- CSV upload as job input (Phase 2)
- Global jobs view across templates (Phase 2/3)
- Condition-sets / field-sets

## Decisions

### D1: Jobs as container + items, not individual renders

**Decision:** Rename the existing `jobs` rows to become `job_items`. Introduce a new `jobs` table as the container.

```
jobs (id, template_id, user_id, name, status, is_active,
      total_count, done_count, failed_count, created_at, completed_at)

job_items (id, job_id FK, record_index, record_id, payload JSONB,
           status, error_message, created_at, completed_at)

generated_documents (id, job_item_id UNIQUE FK, pdf_bytes, created_at)
                     ↑ was job_id
```

**Status enumerations:**

Job status: `draft` | `pending` | `processing` | `done` | `partial` | `failed`
- `draft`: dataset loaded in UI, no items submitted to renderer yet
- `partial`: at least one item done and at least one failed (job as a whole is complete)

Job item status: `loaded` | `queued` | `processing` | `done` | `failed`
- `loaded`: created from the dataset but not yet submitted to the render queue
- `queued`: submitted, waiting for a worker

**Rationale:** The user's mental model of a "job" is a session of work — loading a dataset and producing PDFs from it. The render task for an individual record is an implementation detail. Unifying under a container makes the Data tab's record list, status tracking, and history coherent.

**Alternative considered:** Keep `jobs` as individual renders and add a `job_runs` wrapper above. Rejected — adds a confusing third entity and leaves the naming inverted from user intent.

---

### D2: `is_active` enforced at the database level

**Decision:** Use a PostgreSQL partial unique index:
```sql
CREATE UNIQUE INDEX jobs_one_active_per_template
  ON jobs (template_id)
  WHERE is_active = true;
```

Switching active job is a two-statement transaction: `UPDATE ... SET is_active = false WHERE template_id = $1; UPDATE ... SET is_active = true WHERE id = $2`.

**Rationale:** Application-level enforcement is fragile under concurrent requests. The partial index is zero-cost when `is_active = false` (the common case) and guarantees correctness without a serialisable transaction.

---

### D3: Auto-generated job names

**Decision:** Job names are auto-generated as "Job N" where N is the 1-based count of jobs for that template, ordered by `created_at`. No user-editable name for Phase 1.

**Rationale:** Users don't need to name jobs at this scale. The sequential number plus date in the UI (`Job 5 · 13 Jun`) is sufficient for identification.

---

### D4: Dataset loaded as `job_items` in `loaded` state immediately

**Decision:** When a user pastes a JSON array and confirms, a `jobs` row is created (`status: draft`) and one `job_items` row per record is created (`status: loaded`). The items exist in the DB before any render is triggered.

**Alternative considered:** Store the raw JSON array on the job (`input_data JSONB`) and create `job_items` only when "Generate" is clicked. Rejected — it would require reading from two different structures depending on job state, and makes the record list in the UI more complex to implement.

---

### D5: SVG for in-browser preview, PDF for server-side generation

**Decision:** Add `render_preview_svg` and `render_preview_with_data_svg` WASM exports alongside the existing PDF exports. The Preview tab uses SVG. Server-side generation continues to produce PDF.

**Rationale:**
- SVG is web-native: no iframe chrome, no browser PDF toolbar consuming space
- An HTML overlay layer can be positioned over the SVG for intent chips, making interactive overlays trivial
- Toggling Fields/Data mode is pure CSS — show/hide the overlay layer, no WASM re-render

**Typst SVG export:** Typst renders multi-page documents as multiple SVG elements. We concatenate them vertically with a page gap, matching the single-scroll document feel. Page breaks are inferred from Typst's page dimensions.

**Alternative considered:** Keep PDF iframe with an absolutely-positioned overlay div. Rejected — PDF iframes are opaque to the browser's layout engine; interactive overlays cannot be reliably positioned over them across browsers (especially Safari).

---

### D6: Field expressions evaluated server-side; WASM preview shows raw values

**Decision:** The `expression` property on a field intent contains a Liquid expression generated by the LLM. Expressions are evaluated server-side at render time using the existing Liquid evaluation infrastructure. The WASM preview (which cannot run Liquid) renders the raw field value without format application.

**Tradeoffs:**
- Pro: No JS Liquid library needed in the WASM bundle; simpler WASM path
- Con: Formatted output is only visible in server-generated documents, not in WASM preview

**Mitigation:** In the Preview tab, field intents that have expressions display the raw value with a visual indicator (e.g. `2026-06-30 ƒ`) signalling that a format transform is applied. Clicking the intent chip shows the expression and a server-rendered sample.

**Long-term path (Phase 2):** Translate the expression to Typst-native operations (Typst has date formatting and arithmetic). This would make the WASM preview show the formatted value without server round-trip.

**Derived fields (multi-field computations):** An expression that computes a value from multiple fields (e.g. `{% assign subtotal = 0 %}{% for item in line_items %}...`) is stored as an `expression` on a `DerivedFieldIntent` variant (not a `FieldIntent` — it has no single `field_path`). At compile time, the expression is evaluated server-side to produce a scalar value injected into the Typst source.

---

### D7: Per-record Generate submits that item immediately; job status reflects aggregate

**Decision:**
- Clicking "Generate" on one record: that `job_item` moves from `loaded` → `queued`; a `tokio::spawn` render task fires; job status moves from `draft` to `processing`
- Clicking "Generate all": all `loaded` items move to `queued`; all render tasks fire concurrently via `tokio::spawn`; job status moves to `pending` (no items done yet) → `processing` (first item starts) → `done`/`partial`/`failed` (all finished)
- `done_count` and `failed_count` on the job are incremented atomically as each item completes

---

## Risks / Trade-offs

**[Migration complexity] → Mitigation:** The migration alters `generated_documents.job_id` to `job_item_id` and transfers the `payload` column from `jobs` to `job_items`. This must run in a single transaction. Existing rows can be migrated safely since `generated_documents` has a 1:1 relationship with existing `jobs` rows — each old job becomes a container with one item.

**[Concurrent `is_active` swap] → Mitigation:** The two-statement swap inside a transaction means there is a brief moment where no job is active (between the two UPDATEs). Application code reading `is_active = true` in a concurrent request during this window will find no active job and should treat it as "no active job" rather than an error.

**[SVG multi-page rendering] → Mitigation:** Typst outputs one SVG per page. The frontend concatenates these. If page count is large (>50), scrolling performance may degrade. For Phase 1 this is acceptable; lazy page rendering can be added if needed.

**[WASM preview shows raw values for expressions] → Mitigation:** Visual indicator on intent chips with expressions makes the discrepancy legible. Users are unlikely to be confused if the indicator is clear.

## Migration Plan

All steps in a single migration file:

1. Add columns to `jobs`: `name TEXT`, `is_active BOOLEAN NOT NULL DEFAULT false`, `total_count INTEGER NOT NULL DEFAULT 1`, `done_count INTEGER NOT NULL DEFAULT 0`, `failed_count INTEGER NOT NULL DEFAULT 0`, `completed_at TIMESTAMPTZ`
2. Create `job_items` table (see schema above)
3. For each existing `jobs` row: insert one `job_items` row with `record_index = 0`, `record_id = NULL`, `payload` copied from `jobs.payload`, `status` mapped from `jobs.status` (`pending`→`loaded`, `processing`→`queued`, `done`→`done`, `failed`→`failed`)
4. Update `generated_documents`: rename `job_id` → `job_item_id`; update FK to reference `job_items(id)`
5. Backfill `jobs.done_count` from `job_items` where `status = 'done'`; `failed_count` where `status = 'failed'`
6. Set `is_active = true` for the most recent job (by `created_at`) per `template_id`
7. Drop `payload` and `error_message` columns from `jobs`
8. Add partial unique index `jobs_one_active_per_template`
9. Update `jobs.status` CHECK constraint to include `draft` and `partial`; update `job_items.status` CHECK constraint

**Rollback:** The migration is not easily reversible once `payload` is dropped. Take a DB snapshot before deploying. Rollback path: restore from snapshot.

## Open Questions

| Question | Notes |
|---|---|
| Should job items carry a user-supplied `record_id`? | Useful for meaningful filenames (`invoice-INV-042.pdf`). For Phase 1, auto-index is fine; `record_id` can be added in Phase 2 CSV work |
| What is the maximum items per job for Phase 1? | No hard limit specified; sequential `tokio::spawn` renders will queue naturally. Monitor in Phase 2. |
| Should `draft` jobs be cleaned up on page reload? | If a user loads a dataset and closes the tab, the draft job persists. This may be desirable (resume later) or undesirable (stale drafts). Leave draft jobs persistent for Phase 1. |
