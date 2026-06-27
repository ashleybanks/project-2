## Purpose

Defines the job container model, the Data tab surface for managing datasets and generation jobs, and the REST endpoints for job and item-level operations.

## Requirements

### Requirement: Job container data model
The system SHALL maintain a `jobs` table as the first-class container for a set of records submitted against a template. Each job SHALL have an associated set of `job_items` rows, one per record. A job SHALL track aggregate progress via `total_count`, `done_count`, and `failed_count`.

Job `status` values: `draft` | `pending` | `processing` | `done` | `partial` | `failed`
- `draft`: dataset loaded, no items submitted to renderer
- `pending`: all items queued, none started
- `processing`: at least one item is rendering
- `done`: all items completed successfully
- `partial`: all items finished; at least one failed and at least one succeeded
- `failed`: all items failed

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

### Requirement: Job names are auto-generated
The system SHALL assign each job a name of the form "Job N" where N is the 1-based sequential count of jobs for that template ordered by `created_at`.

#### Scenario: First job is named "Job 1"
- **WHEN** the first job is created for a template
- **THEN** its name is "Job 1"

#### Scenario: Subsequent jobs are numbered sequentially
- **WHEN** a third job is created for a template that already has two jobs
- **THEN** its name is "Job 3"

---

### Requirement: Data tab shows active job at top
The system SHALL display the active job's record list at the top of the Data tab. Inactive, unarchived jobs SHALL be listed below in reverse-chronological order. A "View full history" link SHALL navigate to the full per-template job history page.

#### Scenario: Active job record list displayed
- **WHEN** a user navigates to the Data tab and an active job exists
- **THEN** the active job's name, record count, and creation date are shown as a header
- **THEN** each record is shown as a row with its `record_index`, a status indicator, and action buttons

#### Scenario: Record row actions vary by status
- **WHEN** a record's `job_item.status` is `loaded`
- **THEN** a "Generate" button is shown for that row
- **WHEN** a record's `job_item.status` is `done`
- **THEN** a download link is shown for that row
- **WHEN** a record's `job_item.status` is `failed`
- **THEN** a "Retry" button and error detail affordance are shown

#### Scenario: Generate all CTA shown when items are loaded
- **WHEN** the active job has at least one item with `status: loaded`
- **THEN** a "Generate all" button is shown below the record list
- **WHEN** "Generate all" is clicked
- **THEN** all `loaded` items are submitted to the render queue simultaneously

#### Scenario: Previous jobs listed below active job
- **WHEN** a template has multiple jobs and one is active
- **THEN** previous unarchived jobs are listed below the active job in reverse-chronological order
- **THEN** each shows its name, record count, date, status summary, and a download link (if done)
- **THEN** a "···" menu offers "Make active" and "Archive" options

#### Scenario: Empty state when no active job
- **WHEN** the Data tab is opened and no job exists for the template
- **THEN** an empty state is shown with a prompt to load a dataset and a "+ New job" button

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

### Requirement: Generate API accepts job and item-level operations
The system SHALL provide REST endpoints for job creation, item submission, item download, and job-level ZIP download.

`POST /api/templates/{id}/jobs` — create a new job with a dataset
`POST /api/jobs/{id}/submit` — submit all loaded items (Generate all)
`POST /api/jobs/{id}/items/{item_id}/submit` — submit a single item (Generate per-row)
`GET /api/jobs/{id}` — job status and item list
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

### Requirement: Per-template job history page
The system SHALL provide a dedicated page listing all jobs for a template, including archived ones, in reverse-chronological order.

#### Scenario: History page shows all jobs
- **WHEN** a user navigates to the job history page for a template
- **THEN** all jobs (active, inactive, archived) are listed with name, date, status, record count
- **THEN** completed jobs show a download link
