# Spec: Schema Upload and Storage

## Schema entity

- One schema per template (versioning against template versions is deferred to the batch model change)
- Stored as raw JSON Schema (draft-07 compatible) in a `jsonb` column
- Uploading a new schema replaces the existing one and clears all mappings; resolution runs automatically

## API

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/templates/{id}/schema` | Upload schema; body is the raw JSON Schema object |
| `GET` | `/api/templates/{id}/schema` | Return schema metadata + all intent mappings |
| `DELETE` | `/api/templates/{id}/schema` | Remove schema and all mappings |

`POST` response includes the schema record and triggers resolution asynchronously. The client polls or receives the mappings via the `GET` endpoint once resolution completes.

`GET` response shape:
```json
{
  "id": "...",
  "template_id": "...",
  "created_at": "...",
  "raw_schema": { ... },
  "mappings": [
    {
      "intent_key": "fi_a",
      "intent_label": "customer's full name",
      "intent_type": "field",
      "display_name": "Customer name",
      "field_path": "customer.name",
      "confidence": "high",
      "alternatives": [],
      "parent_key": null
    },
    ...
  ]
}
```

## Upload validation

- Client-side: file must be `.json`; must parse as valid JSON; root must have `"type": "object"`
- Server-side: same validation; rejects with 422 and a plain-English error if invalid
- Error messages:
  - Invalid JSON: "The file couldn't be read as JSON"
  - Non-object root: "The schema must describe an object — the top level should be `{ \"type\": \"object\", ... }`"

## Resolution trigger

Resolution is triggered automatically after a successful upload. It runs asynchronously; the client shows a loading state in the Mappings section until mappings are available. If resolution fails (LLM error), the schema is still stored and the user can trigger re-resolution manually.
