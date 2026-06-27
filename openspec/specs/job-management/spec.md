## Purpose

Defines the job container model, the Data tab surface for managing datasets and generation jobs, and the REST endpoints for job and item-level operations.

## Requirements

### Requirement: Job container data model
The system SHALL maintain a `jobs` table as the first-class container for a set of records submitted against a template. Each job SHALL have an associated set of `job_items` rows, one per record. A job SHALL track aggregate progress via `total_count`, `done_count`, and `failed_count`.

Job `status` values: `draft` | `pending` | `processing` | `done` | `partial` | `failed` | `cancelled`
- `draft`: dataset loaded, no items submitted to renderer
- `pending`: all items queued, none started
- `processing`: at least one item is rendering
- `done`: all items completed successfully
- `partial`: all items finished; at least one failed and at least one succeeded
- `failed`: all items failed
- `cancelled`: job was cancelled before all items completed; automatically archived

Job item `status` values: `loaded` | `queued` | `processing` | `done` | `failed`
- `loaded`: record exists in draft job, not yet submitted to renderer
- `queued`: submitted to render queue, waiting to start

#### Scenario: Job created with items on dataset load
- **WHEN** a user pastes a JSON array of N records and confirms
- **THEN** one `jobs` row is created with `status: draft` and `total_count: N`
- **THEN** N `job_items` rows are created, each with `status: loaded` and `payload` set to the corresponding record

#### Scenario: Single-record job is valid
- **WHEN** a user pastes a JSON array with exactly one record
- **THEN** a job is created with `total_count: 1` and one `job_item`
- **THEN** no special-casing applies; the single-record flow is a degenerate case of the multi-record flow

#### Scenario: Job counts update as items complete
- **WHEN** a `job_item` transitions to `done`
- **THEN** the parent `jobs.done_count` is incremented atomically
- **WHEN** a `job_item` transitions to `failed`
- **THEN** the parent `jobs.failed_count` is incremented atomically
- **WHEN** `done_count + failed_count = total_count`
- **THEN** the job status is set to `done` (if `failed_count = 0`), `partial` (if both > 0), or `failed` (if `done_count = 0`)

---

### Requirement: Exactly one active job per template
The system SHALL enforce that at most one job per template has `is_active = true` at any time, enforced via a partial unique index.

#### Scenario: New job becomes active automatically
- **WHEN** a new job is created for a template
- **THEN** the new job's `is_active` is set to `true`
- **THEN** any previously active job for that template has `is_active` set to `false`
- **THEN** this swap occurs in a single database transaction

#### Scenario: Previous job can be made active
- **WHEN** a user selects "Make active" on a previous job in the Data tab
- **THEN** the selected job's `is_active` is set to `true`
- **THEN** the previously active job's `is_active` is set to `false`
- **THEN** the Preview tab's record navigator updates to reflect the newly active job's records

#### Scenario: Template with no jobs has no active job
- **WHEN** a template has never had a job created
- **THEN** no job has `is_active = true` for that template
- **THEN** the Data tab shows an empty state prompting the user to load a dataset

---

### Requirement: Job archived column
The `jobs` table SHALL have an `archived BOOLEAN NOT NULL DEFAULT false` column. A `cancelled` status value SHALL be added to the `jobs.status` CHECK constraint.

---

### Requirement: Job names are auto-generated
The system SHALL assign each job a name of the form "Job N" where N is the 1-based sequential count of jobs for that template ordered by `created_at`.

#### Scenario: First job is named "Job 1"
- **WHEN** the first job is created for a template
- **THEN** its name is "Job 1"

#### Scenario: Subsequent jobs are numbered sequentially
- **WHEN** a third job is created for a template that already has two jobs
- **THEN** its name is "Job 3"

---

### Requirement: Dataset loaded via JSON array paste
The system SHALL allow users to create a new job by pasting a JSON array. The system SHALL validate that the input is a valid JSON array before creating the job.

#### Scenario: Valid JSON array creates job and items
- **WHEN** a user pastes a valid JSON array into the dataset input and confirms
- **THEN** a draft job is created with one `job_item` per array element
- **THEN** the new job becomes the active job
- **THEN** the record list is displayed immediately

#### Scenario: Invalid JSON shows error inline
- **WHEN** a user pastes malformed JSON and confirms
- **THEN** an inline error is shown ("Invalid JSON — expected an array")
- **THEN** no job is created

#### Scenario: Non-array JSON shows error inline
- **WHEN** a user pastes a valid JSON object (not an array) and confirms
- **THEN** an inline error is shown ("Expected a JSON array of records")
- **THEN** no job is created

---

### Requirement: New job modal with file upload
The new job creation flow SHALL use a modal dialog with two input modes: file upload (drag and drop or browse) and JSON paste.

#### Scenario: File upload mode
- **WHEN** the user opens the New job modal
- **THEN** the Upload file tab is shown by default
- **WHEN** the user drags and drops a `.json` file onto the drop zone
- **THEN** the file is read and its contents are used as the records input
- **WHEN** the file is not a `.json` file
- **THEN** an error is shown: "Only JSON files are supported right now"
- **WHEN** CSV or XLSX files are dropped
- **THEN** the error notes these formats are "coming soon"

#### Scenario: JSON paste mode
- **WHEN** the user switches to the Paste JSON tab
- **THEN** a textarea is shown for pasting a JSON array directly
- **THEN** submission behaviour is identical to the existing JSON paste flow

---

### Requirement: Generate API accepts job and item-level operations
The system SHALL provide REST endpoints for job creation, item submission, item download, and job-level ZIP download.

`POST /api/templates/{id}/jobs` — create a new job with a dataset
`POST /api/jobs/{id}/submit` — submit all loaded items (Generate all)
`POST /api/jobs/{id}/items/{item_id}/submit` — submit a single item (Generate per-row)
`GET /api/jobs/{id}` — job status and item list; response includes `archived: bool`
`GET /api/templates/{id}/jobs` — list jobs for a template; each job object includes `archived: bool`
`GET /api/jobs/{id}/items/{item_id}/download` — download a completed item's PDF
`GET /api/jobs/{id}/download` — download a ZIP of all completed items
`PATCH /api/jobs/{id}/active` — make this job the active job for its template

#### Scenario: Create job returns 201 with job id and item ids
- **WHEN** `POST /api/templates/{id}/jobs` is called with a valid JSON array body
- **THEN** the response is `201 Created` with `{ "job_id": "uuid", "item_count": N }`

#### Scenario: Submit all queues all loaded items
- **WHEN** `POST /api/jobs/{id}/submit` is called
- **THEN** all `loaded` items for that job are moved to `queued`
- **THEN** a render task is spawned for each item
- **THEN** the response is `202 Accepted`

#### Scenario: Download ZIP streams completed PDFs
- **WHEN** `GET /api/jobs/{id}/download` is called and at least one item is `done`
- **THEN** the response is a ZIP file containing one PDF per completed item
- **THEN** each PDF is named `{record_id}.pdf` if `record_id` is set, else `record_{index}.pdf`
- **WHEN** no items are done
- **THEN** the response is `409 Conflict`

---

### Requirement: Job lifecycle — archive, unarchive, cancel
The system SHALL support archiving, unarchiving, and cancelling jobs via dedicated REST endpoints. Archived jobs SHALL be hidden from the default (Active) view in the Data tab. Cancelled jobs SHALL be automatically archived.

#### Scenario: Archive a terminal job
- **WHEN** `POST /api/jobs/{id}/archive` is called on a job with status `done`, `partial`, or `failed`
- **THEN** the job's `archived` flag is set to `true`
- **THEN** the response is `200 OK`
- **WHEN** the job is in `draft`, `pending`, or `processing` status
- **THEN** the response is `409 Conflict` with an appropriate error message

#### Scenario: Unarchive a job
- **WHEN** `POST /api/jobs/{id}/unarchive` is called
- **THEN** the job's `archived` flag is set to `false`
- **THEN** the response is `200 OK`

#### Scenario: Cancel an in-flight job
- **WHEN** `POST /api/jobs/{id}/cancel` is called on a job with status `draft`, `pending`, or `processing`
- **THEN** the job's status is set to `cancelled` and `archived` is set to `true` atomically
- **THEN** the response is `200 OK`
- **WHEN** the job is already terminal (done/partial/failed/cancelled)
- **THEN** the response is `409 Conflict`

#### Scenario: Cancelled status is not overwritten by render completion
- **WHEN** a job is cancelled while render tasks are still in flight
- **THEN** in-flight render tasks are allowed to complete naturally (no task interruption)
- **THEN** `update_job_aggregate` does NOT overwrite the `cancelled` status when items finish
- **THEN** the job remains in `cancelled` status regardless of item outcomes

#### Scenario: Cancelled jobs appear in archived view only
- **WHEN** the Data tab filter is set to "Active"
- **THEN** jobs with `archived = true` (including all cancelled jobs) are not shown
- **WHEN** the Data tab filter is set to "All"
- **THEN** cancelled and archived jobs are included in the list

---

### Requirement: Table-based job management UI
The Data tab SHALL display all jobs in a full-width data table with sortable columns, client-side pagination, row-level actions, and bulk actions. The table replaces the previous active-job/previous-jobs split layout.

#### Scenario: Job table columns
- **WHEN** the Data tab is shown
- **THEN** the table has columns: Submitted (datetime), Submitted by, Via, Description, Records, Status, Actions
- **THEN** Submitted and Records columns are sortable; Submitted defaults to descending
- **THEN** Submitted by and Via show `—` until backend provides these fields

#### Scenario: Row actions are contextual by status
- **WHEN** a job's status is `draft`, `pending`, or `processing`
- **THEN** the row shows: Preview, Cancel
- **WHEN** a job's status is `done`, `partial`, or `failed`
- **THEN** the row shows: Preview, Download (if done_count > 0), Archive
- **WHEN** a job's `archived` flag is `true`
- **THEN** the Archive action is replaced by Unarchive

#### Scenario: Preview row action
- **WHEN** a user clicks Preview on a job row
- **THEN** the system sets that job as the active job (PATCH /api/jobs/{id}/active)
- **THEN** the user is navigated to the Preview tab
- **THEN** the active job concept is not otherwise surfaced in the UI

#### Scenario: Bulk actions appear on selection
- **WHEN** one or more rows are selected
- **THEN** the toolbar shows: count of selected rows, and contextual bulk actions
- **THEN** Download is shown if any selected job has done_count > 0
- **THEN** Archive is shown if any selected job is terminal and not archived
- **THEN** Cancel is shown if any selected job is in draft/pending/processing

#### Scenario: Active/All filter
- **WHEN** the filter is "Active" (default)
- **THEN** only jobs with `archived = false` are shown
- **WHEN** the filter is "All"
- **THEN** all jobs including archived and cancelled are shown

#### Scenario: Pagination
- **WHEN** the job list has more than 25 items
- **THEN** items are paginated at 25 per page
- **THEN** navigation shows current page, total pages, and previous/next controls

---

### Requirement: URL-based tab routing
The Data tab SHALL be accessible at a stable URL. Switching between template tabs SHALL update the browser URL, enabling deep links and browser history navigation.

#### Scenario: Tab URLs
- **WHEN** the Design tab is active: URL is `/app/templates/:id`
- **WHEN** the Data tab is active: URL is `/app/templates/:id/jobs`
- **WHEN** the Preview tab is active: URL is `/app/templates/:id/preview`
- **WHEN** a job detail is open: URL is `/app/templates/:id/jobs/:jobId`

#### Scenario: Deep link to Data tab
- **WHEN** a user navigates directly to `/app/templates/:id/jobs`
- **THEN** the Data tab is active and the job table is shown

---

### Requirement: Per-template job history page
The system SHALL provide a dedicated page listing all jobs for a template, including archived ones, in reverse-chronological order.

#### Scenario: History page shows all jobs
- **WHEN** a user navigates to the job history page for a template
- **THEN** all jobs (active, inactive, archived) are listed with name, date, status, record count
- **THEN** completed jobs show a download link
