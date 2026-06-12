# Spec: Test Data Generation

## Purpose

Generate a set of sample records conforming to the uploaded JSON Schema. The goal is to let the template author verify the schema looks right and the mappings make sense before submitting real data. This is a preview only — records are not persisted and no PDFs are generated in this change.

## API

`POST /api/templates/{id}/schema/test-data?count=10`

- `count` defaults to 10; not user-configurable in this change
- Uses a JSON Schema faker library (e.g. `json-schema-faker`) to produce structurally valid records
- Returns a JSON array of records

Optional LLM enhancement (controlled by a backend feature flag, not user-facing in this change):
- Pass field names, intent labels, and one raw faker-generated record to the LLM
- LLM rewrites string values to be domain-appropriate (e.g. realistic customer names, plausible invoice amounts)
- LLM call uses `/no_think` mode
- If LLM call fails, raw faker output is returned without error

## Data tab — Test data area

### Before generation (schema exists, not yet generated)

```
┌─────────────────────────────────────────────────────────────────┐
│ Test data                                                        │
│ Generate sample records to verify your schema and mappings.     │
│                                     [Generate 10 records]       │
└─────────────────────────────────────────────────────────────────┘
```

### After generation

```
┌─────────────────────────────────────────────────────────────────┐
│ Test data                            10 records  [↓ Export JSON]│
│                                                   [Regenerate]  │
├──────────────────┬──────────────┬───────────────┬───────────────┤
│ customer.name    │ invoice.date │ invoice.total │ invoice.items │
├──────────────────┼──────────────┼───────────────┼───────────────┤
│ Jane Smith       │ 2025-06-01   │ 480.00        │ 3 items ▸     │
│ Acme Corp Ltd    │ 2025-06-03   │ 1200.00       │ 1 item  ▸     │
│ ...              │ ...          │ ...           │ ...           │
└──────────────────┴──────────────┴───────────────┴───────────────┘
```

- Columns are root-level fields from the schema (not display names in this change)
- Array fields show item count with a `▸` expand toggle
- Expanding an array cell shows a nested table of that record's items inline
- **[Regenerate]**: fetches a new set of records; replaces the current set (no history)
- **[↓ Export JSON]**: downloads the full records array as a `.json` file
- Hidden until a schema is uploaded
