## Why

The job management surface was a narrow, list-style UI with an "active job" concept that added cognitive overhead without clear benefit. The "active job" was prominently surfaced as a distinct entity, with previous jobs hidden behind a collapsible disclosure — but the distinction between active and inactive jobs was laboured and not meaningful to users. The surface also lacked lifecycle actions (archive, cancel) and was constrained to a pillarbox-width layout despite being the primary working surface on the Data tab.

Separately, the tab URL structure did not update on navigation — switching between Design / Data / Preview produced no URL change, making deep links and browser history non-functional.

## What Changes

### Frontend — jobs table

- **Full-width layout**: `JobPane` is no longer pillarbox-constrained. The table takes the full viewport width.
- **TanStack Table**: replaces the hand-rolled list with a proper data table (`@tanstack/react-table`). Columns: Submitted (datetime, sortable), Submitted by (future), Via (web vs API, future), Description, Records (sortable), Status, Actions.
- **Active job concept removed**: the distinction between "active" and "previous" jobs is no longer surfaced in the UI. All jobs appear in a single table. The `is_active` backend concept is retained (it drives the Preview tab data source) but exposed only through the **Preview** row action, which promotes the selected job to active and navigates to the Preview tab transparently.
- **Row actions**: Preview, Download (when done_count > 0), Cancel (when job is in draft/pending/processing), Archive/Unarchive (when job is terminal: done/partial/failed).
- **Bulk actions**: when rows are selected, Download (applicable rows), Archive (terminal rows), and Cancel (in-flight rows) appear in the toolbar.
- **Archive/Active filter**: a segmented control in the toolbar toggles between Active (default, hides archived jobs) and All.
- **Right panel hidden**: the styling/history right panel is not shown on the Data tab — it is only relevant to the Design tab.
- **New job modal**: replaces the inline textarea form. A modal with two tabs — Upload file (drag & drop, JSON now; CSV/XLSX planned) and Paste JSON.
- **Client-side pagination**: 25 rows per page.

### Frontend — URL routing

Tab state is now reflected in the URL, enabling deep links and correct browser history:

```
/app/templates/:id            → Design tab (default)
/app/templates/:id/jobs       → Data tab (job table)
/app/templates/:id/preview    → Preview tab
/app/templates/:id/jobs/:jobId → Job detail page
```

The old standalone `/app/templates/:id/jobs` list route (JobHistoryPage) is retired; the full table lives in the Data tab. The detail page is a new `JobDetailPage` at `/jobs/:jobId`.

### Backend — job lifecycle

New endpoints on the jobs API:

- `POST /api/jobs/{id}/archive` — marks a job archived (`archived = true`). Only applicable to terminal jobs (done/partial/failed/cancelled).
- `POST /api/jobs/{id}/unarchive` — clears the archived flag (`archived = false`).
- `POST /api/jobs/{id}/cancel` — cancels an in-flight job. Only applicable to jobs in `draft`, `pending`, or `processing`. Sets `status = 'cancelled'` and `archived = true` atomically. In-flight render tasks (already spawned) are allowed to complete; `update_job_aggregate` is guarded to not overwrite `cancelled` status.

### Database

- New column: `jobs.archived BOOLEAN NOT NULL DEFAULT false`
- New status value: `cancelled` added to the `jobs.status` CHECK constraint
- `update_job_aggregate` in `render.rs` gains a guard: does not update status on jobs already in `cancelled` state

## Capabilities Modified

- `job-management`: archive/unarchive/cancel lifecycle; table-based UI; URL routing; file upload for new jobs; submitted-by and via columns (future stubs)

## Non-goals

- Does not implement server-side pagination — client-side is sufficient at current volumes
- Does not implement CSV/XLSX upload — JSON only for this change; file format expansion is Phase 2
- Does not add `submitted_by` or `source` (web vs API) to the backend Job model — columns are present in the UI as `—` placeholders; backend support is a separate change
- Does not add job-level retry (re-submit a failed job with the same records)
- Does not implement true Tokio task cancellation for in-flight render items — cancelled jobs allow in-flight tasks to complete naturally

## Impact

- `apps/web/src/components/JobPane.tsx` — full rewrite
- `apps/web/src/pages/JobDetailPage.tsx` — new page (replaces JobHistoryPage)
- `apps/web/src/pages/JobHistoryPage.tsx` — deleted
- `apps/web/src/pages/TemplatePage.tsx` — URL-driven tab state; RightPanel hidden on data tab
- `apps/web/src/App.tsx` — new routes for /jobs, /preview, /jobs/:jobId
- `apps/web/src/lib/api.ts` — archive/unarchive/cancel stubs; archived field on Job; cancelled status type
- `apps/web/package.json` — @tanstack/react-table added
- `apps/api/src/jobs/handlers.rs` — three new handlers; JobSummary/JobResponse gain archived field
- `apps/api/src/jobs/mod.rs` — three new routes wired
- `apps/api/src/jobs/render.rs` — update_job_aggregate guarded against cancelled status
- `apps/api/migrations/0020_add_job_archive_cancel.sql` — new migration

## Phase

Phase 1 — completes the job management surface before batch/webhook work in Phase 2.
