## Changes to: job-management

### New Requirement: Job lifecycle — archive, unarchive, cancel

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

### New Requirement: Job archived column
The `jobs` table SHALL have an `archived BOOLEAN NOT NULL DEFAULT false` column. A `cancelled` status value SHALL be added to the `jobs.status` CHECK constraint.

Job `status` values (updated): `draft` | `pending` | `processing` | `done` | `partial` | `failed` | `cancelled`

---

### New Requirement: Table-based job management UI
The Data tab SHALL display all jobs in a full-width data table with sortable columns, client-side pagination, row-level actions, and bulk actions. The table SHALL replace the previous active-job/previous-jobs split layout.

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

### New Requirement: URL-based tab routing
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

### New Requirement: New job modal with file upload
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

### Modified Requirement: Job listing includes archived field
`GET /api/templates/{id}/jobs` and `GET /api/jobs/{id}` responses SHALL include `archived: bool` in the job object.

### Removed Requirement: Active job prominently surfaced in UI
The previous requirement that the active job be shown as a distinct top section with previous jobs collapsed below is superseded by the table-based UI. The `is_active` backend concept is retained but not directly surfaced; it is used implicitly by the Preview row action.
