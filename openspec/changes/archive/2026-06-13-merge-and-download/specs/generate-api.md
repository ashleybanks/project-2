---
capability: generate-api
status: done
---

# Generate API

## POST /api/templates/{id}/generate

Enqueues a document generation job for the given template.

**Auth:** required (session cookie)

**Request body:**
```json
{ "payload": { ...any object... } }
```

**Responses:**

`202 Accepted`
```json
{ "job_id": "uuid" }
```

`404 Not Found` — template does not exist or is not owned by the authenticated user

`422 Unprocessable Entity` — payload fails schema validation
```json
{
  "errors": [
    { "field": "client.name", "message": "is required" },
    { "field": "amount", "message": "expected number, got string" }
  ]
}
```

**Behaviour:**
- Validation only runs if the template has an uploaded schema. No schema = no validation.
- Job row is inserted with `status: pending` before the background task starts.
- Render runs in a `tokio::spawn` task. The 202 response is returned immediately.

---

## GET /api/jobs/{id}

Returns the current status of a generation job.

**Auth:** required; user must own the job

**Response `200`:**
```json
{
  "id": "uuid",
  "status": "pending | processing | done | failed",
  "error_message": null,
  "download_url": "/api/jobs/{id}/download"
}
```

`download_url` is present only when `status = done`. `error_message` is present only when `status = failed`.

**Responses:**
- `404` — job not found or not owned by user

---

## GET /api/jobs/{id}/download

Streams the generated PDF for a completed job.

**Auth:** required; user must own the job

**Response `200`:**
- `Content-Type: application/pdf`
- `Content-Disposition: attachment; filename="document.pdf"`
- Body: raw PDF bytes

**Responses:**
- `404` — job not found or not owned by user
- `409 Conflict` — job exists but is not yet done
