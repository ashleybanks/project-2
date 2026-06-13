---
id: tasks
status: done
---

# Tasks — merge-and-download

## Backend

- [x] 1. Migration 0015: create `jobs` table (id, template_id, user_id, status CHECK, payload JSONB, error_message, created_at, started_at, completed_at)
- [x] 2. Migration 0016: create `generated_documents` table (id, job_id UNIQUE FK, pdf_bytes BYTEA, created_at)
- [x] 3. Run migrations
- [x] 4. Add `jsonschema` crate to `apps/api/Cargo.toml`
- [x] 5. Create `src/jobs/mod.rs` — declare `handlers` and `render` submodules; export router
- [x] 6. `src/jobs/render.rs` — `run_render_job(state, job_id)`: set processing → load template/payload → compile → render → upsert generated_documents → set done/failed
- [x] 7. `src/jobs/handlers.rs` — `generate` handler: load template, validate payload against schema (if exists), insert job, tokio::spawn run_render_job, return 202
- [x] 8. `src/jobs/handlers.rs` — `get_job` handler: fetch job by id + user ownership, return status JSON with download_url when done
- [x] 9. `src/jobs/handlers.rs` — `download` handler: fetch generated_documents by job_id, stream BYTEA as application/pdf
- [x] 10. Wire jobs router into `main.rs`: `POST /api/templates/{id}/generate`, `GET /api/jobs/{id}`, `GET /api/jobs/{id}/download`

## WASM

- [x] 11. Add `render_preview_with_data(blocks_json, stylesheet_json, data_json, font_data)` export to `crates/typst-compiler/src/wasm.rs`
- [x] 12. Rebuild WASM and copy output to `apps/web/public/typst-compiler/` (same as existing build step)

## Frontend — live preview with data

- [x] 13. Add `DataSelector` component (`apps/web/src/components/DataSelector.tsx`): "No data" / "Test record N" / "Custom JSON" dropdown + textarea; fetches test data via existing `GET /schema/test-data` query
- [x] 14. Update preview hook / `PreviewPane` to accept `payload?: object` and call `render_preview_with_data` instead of `render_preview` when payload is provided
- [x] 15. Render `DataSelector` above the PDF iframe in `PreviewPane`; wire selected payload through to renderer
- [x] 16. Add "Download preview" button to `PreviewPane` toolbar; on click, write current PDF bytes as `Blob` download (`preview.pdf`)

## Frontend — generate panel

- [x] 17. Add `generateDocument`, `getJob` functions and `JobStatus` type to `apps/web/src/lib/api.ts`
- [x] 18. Create `GenerateSheet.tsx` (`apps/web/src/components/GenerateSheet.tsx`): sheet with JSON textarea, "Use test data" filler, Generate button, status display, Download link
- [x] 19. Poll `GET /api/jobs/{id}` every 2s after submit (TanStack Query `refetchInterval`); stop when status is done or failed
- [x] 20. Show schema validation errors (422 response field list) inline in the sheet
- [x] 21. Add "Generate" button to `TemplatePage` header; wire `GenerateSheet` open/close
