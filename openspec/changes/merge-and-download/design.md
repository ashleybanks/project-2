---
id: design
status: done
---

# Merge and Download — Design

## Backend

### DB migrations

**0015_create_jobs.sql**
```sql
CREATE TABLE jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'done', 'failed')),
    payload JSONB NOT NULL,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);
CREATE INDEX jobs_template_id_idx ON jobs(template_id);
CREATE INDEX jobs_user_id_idx ON jobs(user_id);
```

**0016_create_generated_documents.sql**
```sql
CREATE TABLE generated_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
    pdf_bytes BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### API module: `src/jobs/`

**`handlers.rs`**

`POST /api/templates/{id}/generate`
- Auth required
- Load template (block_model, stylesheet) — 404 if not found or not owned by user
- If template has a schema: validate payload against raw_schema using `jsonschema` crate; return 422 with field-level errors on failure
- If no schema: accept payload as-is (no validation)
- INSERT job row (status: pending, payload: body)
- `tokio::spawn` → `run_render_job(state, job_id)`
- Return `202 { job_id }`

`GET /api/jobs/{id}`
- Auth required, user must own the job
- Return `{ id, status, error_message, download_url }` where `download_url` is present only when status = done

`GET /api/jobs/{id}/download`
- Auth required, user must own the job
- Job must have status = done
- SELECT pdf_bytes from generated_documents WHERE job_id = $1
- Return bytes as `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="document.pdf"`

**`render.rs`**

`run_render_job(state, job_id)`:
1. UPDATE jobs SET status = 'processing', started_at = now() WHERE id = $1
2. Load template (block_model, stylesheet)
3. Load payload from jobs.payload
4. Compile block model → Typst source via `typst_compiler::compile()`
5. Render: `typst_compiler::render(&source, &payload)` → `Vec<u8>`
6. On success: INSERT generated_documents; UPDATE jobs SET status = 'done', completed_at = now()
7. On error: UPDATE jobs SET status = 'failed', error_message = ..., completed_at = now()

### Schema validation

Use the `jsonschema` crate. Validate `payload` against `template_schemas.raw_schema`. Collect all validation errors and return them as:
```json
{
  "errors": [
    { "field": "client.name", "message": "is required" },
    { "field": "amount", "message": "expected number, got string" }
  ]
}
```

### Router additions

```
POST  /api/templates/{id}/generate   → jobs::generate
GET   /api/jobs/{id}                 → jobs::get_job
GET   /api/jobs/{id}/download        → jobs::download
```

Jobs routes require auth. `/{id}/generate` is nested under the templates router; job status/download are top-level.

---

## WASM: live preview with data

`wasm.rs` — add second export:
```rust
#[wasm_bindgen]
pub fn render_preview_with_data(
    blocks_json: &str,
    stylesheet_json: &str,
    data_json: &str,       // JSON string, pass "{}" for empty
    font_data: &Array,
) -> Result<Vec<u8>, JsValue>
```

The existing `render_preview` (empty data) stays for backwards compat.

---

## Frontend

### Preview mode: data selector

New `DataSelector` component rendered in the preview toolbar row (above the PDF iframe):

```
[ No data ▾ ]   →  empty {} passed to WASM
[ Test record 1 ▾ ]  →  first test data row
[ Custom JSON… ]  →  opens a small textarea popover; "Apply" button
[ ↓ Download preview ]  →  triggers Blob download of current PDF bytes
```

State:
- `selectedDataMode: "none" | "test:{index}" | "custom"`
- `customJson: string`
- Current preview bytes already available from `usePreview` hook — reuse, but pass `resolvedPayload` to WASM

Modifications to existing preview hook / `PreviewPane`:
- Accept `payload?: object`
- Pass `JSON.stringify(payload ?? {})` to `render_preview_with_data`

### Generate panel

A "Generate" button in the template page header (next to the mode switcher). Opens a sheet/modal:

```
┌─────────────────────────────────────┐
│  Generate document                  │
│                                     │
│  Payload                            │
│  ┌─────────────────────────────┐   │
│  │ { JSON textarea }           │   │
│  └─────────────────────────────┘   │
│  [ Use test data ▾ ]               │
│                                     │
│  [ Generate ]                       │
│                                     │
│  ── After submit ──                 │
│  ● Processing…                      │
│  ✓ Ready  [ Download PDF ]         │
│  ✗ Failed: <error message>         │
└─────────────────────────────────────┘
```

Behaviour:
- "Use test data" fills the textarea from the selected test record
- Submit → `POST /generate` → show spinner → poll `GET /api/jobs/{id}` every 2s
- On done: show download link (hits `GET /api/jobs/{id}/download`)
- On failed: show error_message from job row
- Schema validation errors from 422 response shown inline (field: message list)

### API client additions (`lib/api.ts`)

```ts
generateDocument(templateId: string, payload: object): Promise<{ job_id: string }>
getJob(jobId: string): Promise<JobStatus>
getJobDownloadUrl(jobId: string): string  // just constructs the URL for <a href>
```

```ts
interface JobStatus {
  id: string
  status: "pending" | "processing" | "done" | "failed"
  error_message: string | null
  download_url: string | null
}
```

### Component location

- `GenerateSheet.tsx` — sheet/modal component, all generate state inside
- Button added to `TemplatePage.tsx` header row
- `DataSelector.tsx` — data picker for preview mode, used inside `PreviewPane`

---

## Cargo dependency

Add to `apps/api/Cargo.toml`:
```toml
jsonschema = { version = "0.26", default-features = false }
```

(No default features to avoid pulling in unused validators.)
