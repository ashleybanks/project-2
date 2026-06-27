---
capability: generate-api
status: done
---

# Generate API

## Requirements

### Requirement: Job endpoints operate on the container+items model
The generate API SHALL be restructured to reflect the job container and job item hierarchy. All existing single-document endpoints are replaced by job-level and item-level endpoints.

**Endpoints:**

`POST /api/templates/{id}/jobs`
- Body: `{ "records": [{...}, {...}] }` — JSON array of payloads
- Response `201`: `{ "job_id": "uuid", "item_count": N }`
- Response `422`: per-record validation errors (see below)
- Validates all records against the template schema before creating the job
- Creates a `jobs` row (`status: draft`) and one `job_items` row per record (`status: loaded`)
- The new job becomes the active job for the template

`POST /api/jobs/{id}/submit`
- Submits all `loaded` items in the job to the render queue
- Response `202`: `{ "queued": N }`

`POST /api/jobs/{id}/items/{item_id}/submit`
- Submits a single `loaded` item to the render queue
- Response `202`

`GET /api/jobs/{id}`
- Returns job status and item list
- Response `200`: `{ "id", "name", "status", "total_count", "done_count", "failed_count", "is_active", "items": [{ "id", "record_index", "status", "error_message" }] }`

`GET /api/jobs/{id}/items/{item_id}/download`
- Streams the generated PDF for a completed item
- Response `200`: `Content-Type: application/pdf`, `Content-Disposition: attachment`
- Response `404`: item not found or not owned by user
- Response `409`: item not yet done

`GET /api/jobs/{id}/download`
- Streams a ZIP of all completed items in the job
- Response `200`: `Content-Type: application/zip`
- Response `404`: job not found or not owned by user
- Response `409`: no items done yet

`PATCH /api/jobs/{id}/active`
- Makes this job the active job for its template (swaps `is_active` in a transaction)
- Response `200`: `{ "job_id": "uuid" }`

#### Scenario: Creating a job validates all records before inserting
- **WHEN** `POST /api/templates/{id}/jobs` is called with records that fail schema validation
- **THEN** the response is `422` with per-record errors: `{ "errors": [{ "record_index": 2, "field": "client.name", "message": "is required" }] }`
- **THEN** no job or job items are created

#### Scenario: Creating a job with valid records returns 201
- **WHEN** `POST /api/templates/{id}/jobs` is called with all-valid records
- **THEN** the response is `201` with `job_id` and `item_count`
- **THEN** the job is immediately the active job for the template

#### Scenario: Submit all returns 202 with count of queued items
- **WHEN** `POST /api/jobs/{id}/submit` is called on a draft job with N loaded items
- **THEN** the response is `202 Accepted` with `{ "queued": N }`
- **THEN** all N items begin rendering asynchronously

#### Scenario: Job download returns ZIP of completed PDFs
- **WHEN** `GET /api/jobs/{id}/download` is called and 3 of 10 items are done
- **THEN** the response is a ZIP containing 3 PDF files
- **THEN** the filenames are `record_0.pdf`, `record_1.pdf`, etc. (or `{record_id}.pdf` if set)
