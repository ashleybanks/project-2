# Tasks — jobs-redesign

## 1. Frontend — jobs table UI

- [x] 1.1 Install `@tanstack/react-table` in `apps/web`. **AC:** package present in `package.json`; `npm install` succeeds.

- [x] 1.2 Rewrite `JobPane.tsx` as a full-width TanStack Table. Columns: Submitted (datetime, sortable, default desc), Submitted by (—), Via (—), Description, Records (sortable), Status, Actions. Remove `max-w-2xl` pillarbox constraint. Add client-side pagination at 25 rows/page. **AC:** table renders all jobs; sorting works on Submitted and Records; pagination appears when > 25 jobs.

- [x] 1.3 Remove the active-job/previous-jobs split layout from `JobPane`. All jobs appear in a single table. Remove the "Make active" button and the active-job left-border indicator. **AC:** no "active job" or "previous jobs" section; `is_active` not mentioned in the UI.

- [x] 1.4 Add row actions to `JobPane`: Preview (all rows), Download (done_count > 0), Cancel (draft/pending/processing), Archive/Unarchive (terminal jobs). Actions appear on row hover. **AC:** correct actions shown for each status variant; Download links to correct URL.

- [x] 1.5 Add Preview row action: calls `PATCH /api/jobs/{id}/active` then navigates to `/app/templates/:id/preview`. **AC:** clicking Preview on any row sets that job active and navigates to Preview tab.

- [x] 1.6 Add bulk actions toolbar: shown when rows are selected. Download (any done rows), Archive (any terminal non-archived rows), Cancel (any in-flight rows). **AC:** selecting rows reveals bulk toolbar; each action applies only to applicable rows.

- [x] 1.7 Add Active/All filter segmented control to the toolbar. Active (default): hides archived jobs. All: shows everything. **AC:** toggling shows/hides archived and cancelled jobs correctly.

- [x] 1.8 Replace inline `NewJobForm` with a modal. Modal has two tabs: Upload file (drag & drop `.json`, browse button) and Paste JSON. File is read client-side and used as the records input. **AC:** modal opens on "+ New job"; both tabs work; file drop populates the records; JSON paste still works.

- [x] 1.9 Hide the `RightPanel` on the Data tab (`mode === "data"`). Main area takes full width. Update `main` className to use `overflow-hidden flex flex-col` for the data tab so `JobPane` controls its own scroll. **AC:** no right panel visible on Data tab; table scrolls internally; pagination bar sticks to bottom.

## 2. Frontend — URL routing

- [x] 2.1 Update `App.tsx` routes: add `/templates/:id/jobs` (Data tab), `/templates/:id/preview` (Preview tab), `/templates/:id/jobs/:jobId` (detail). Remove old `/templates/:id/jobs` list route. **AC:** all three routes render the correct component; old list-only route gone.

- [x] 2.2 Update `TemplatePage.tsx`: derive active tab from `location.pathname` instead of `useState`. On tab click, `navigate()` to the corresponding URL. **AC:** browser URL updates on tab switch; refreshing the page restores the correct tab; back/forward navigation works.

- [x] 2.3 Create `JobDetailPage.tsx` at `/templates/:id/jobs/:jobId`. Shows job header (status badge, submitted at, record counts), back link → `/jobs`, and a full-width records table (index, label, status dot, per-item Generate/Download actions). Delete `JobHistoryPage.tsx`. **AC:** navigating to a job row opens the detail page; back link returns to job list.

## 3. Frontend — api types

- [x] 3.1 Add `"cancelled"` to `JobContainerStatus` union type in `api.ts`. **AC:** TypeScript compiles without error; `cancelled` is a valid status throughout the frontend.

- [x] 3.2 Add `cancelled` entry to `StatusBadge` config in `JobPane.tsx` (label: "Cancelled", colour: muted). **AC:** a job with `status: "cancelled"` renders a badge rather than crashing.

## 4. Backend — database migration

- [x] 4.1 Write migration `0020_add_job_archive_cancel.sql`: add `archived BOOLEAN NOT NULL DEFAULT false` to `jobs`; drop and recreate `jobs_status_check` to include `cancelled`. **AC:** `cargo sqlx migrate run` succeeds; `\d jobs` shows the new column and updated constraint.

## 5. Backend — render guard for cancelled status

- [x] 5.1 In `render.rs`, add `AND j.status != 'cancelled'` to the WHERE clause of `update_job_aggregate`. **AC:** cancelling a processing job and allowing in-flight renders to complete does not change the job status from `cancelled` to `done`/`partial`.

## 6. Backend — lifecycle handlers

- [x] 6.1 Add `archived: bool` to `JobSummary` and `JobResponse` structs in `handlers.rs`. Update `list_template_jobs` and `get_job` queries to select the `archived` column. **AC:** `GET /api/templates/{id}/jobs` and `GET /api/jobs/{id}` include `archived` in the response body.

- [x] 6.2 Implement `archive_job` handler (`POST /api/jobs/{id}/archive`): ownership check; verify job status is terminal (done/partial/failed) — return 409 otherwise; set `archived = true`. **AC:** archiving a done job returns 200; archiving a processing job returns 409.

- [x] 6.3 Implement `unarchive_job` handler (`POST /api/jobs/{id}/unarchive`): ownership check; set `archived = false`. **AC:** unarchiving an archived job returns 200; job reappears in Active view.

- [x] 6.4 Implement `cancel_job` handler (`POST /api/jobs/{id}/cancel`): ownership check; verify status is in (draft/pending/processing) — return 409 otherwise; in a single UPDATE set `status = 'cancelled'`, `archived = true`. **AC:** cancelling a draft job returns 200 and sets both fields; cancelling a done job returns 409.

- [x] 6.5 Wire the three new routes in `mod.rs`:
  - `POST /{id}/archive` → `handlers::archive_job`
  - `POST /{id}/unarchive` → `handlers::unarchive_job`
  - `POST /{id}/cancel` → `handlers::cancel_job`

  **AC:** `cargo build` clean; all three endpoints return expected responses.
