---
id: proposal
status: done
---

# Merge and Download

## What and why

Completes the Phase 1 "prove the loop" goal. A user has built a template, mapped it to a schema, and generated test data — now they need to merge real data into the template and get a PDF.

Two delivery modes:

**Live merged preview** — extends the existing WASM preview to accept a data payload. The user selects a test data record (or enters custom JSON) in preview mode and sees the rendered PDF update immediately, exactly as it will look when generated. No server round-trip.

**Stored document generation** — `POST /generate` accepts a payload, validates it against the schema, renders the PDF server-side, stores it, and makes it downloadable. This is the authoritative output path: correct fonts, audit trail, the thing the user actually downloads.

## Scope

### In

- WASM renderer accepts an optional data payload (single parameter addition)
- Preview mode data selector: no data / test record / custom JSON textarea
- "Download preview" shortcut — exports current WASM bytes as PDF without hitting the server
- `POST /api/templates/{id}/generate` — validates payload, fires tokio::spawn render, returns job id
- `GET /api/jobs/{id}` — status (pending / processing / done / failed) + download URL when done
- `GET /api/jobs/{id}/download` — streams stored PDF bytes
- DB: `jobs` + `generated_documents` tables; PDF bytes in BYTEA (postgres, no additional service)
- JSON Schema validation of payload before render (field-level errors returned)
- Generate panel in the template page header area or as a modal — payload input + submit + status + download

### Out

- Batch generation (N records → N PDFs) — Phase 2
- Webhooks — Phase 2
- Object storage migration — Phase 2
- Stored document listing / history — Phase 2
- Worker horizontal scaling / SKIP LOCKED multi-worker — Phase 2 (single tokio::spawn is fine for MVP)

## Key decision

For MVP, the job "queue" is just a postgres `jobs` table + `tokio::spawn`. A single in-process worker is sufficient. The table row tracks state so the frontend can poll. No pgmq, no SKIP LOCKED, no separate process. Migrate if volume demands it.
