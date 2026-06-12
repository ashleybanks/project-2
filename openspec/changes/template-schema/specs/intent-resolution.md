# Spec: Intent Resolution

## Intent extraction

Walk the block model depth-first. Collect every intent node with its structural context:

```
For each fieldIntent node:
  { key, label, type: "field", parent_key: null | <repeat section key> }

For each section with repeatIntent:
  { key, label: section.repeatIntent, type: "repeat", parent_key: null }
  Then recurse into section.content for nested fieldIntents (parent_key = section key)

For each section with conditionIntent:
  { key, label: section.conditionIntent, type: "condition", parent_key: null }
  (fieldIntents inside condition sections are extracted with parent_key = condition section key,
   but resolve against the root schema — not a nested type)
```

The `parent_key` for field intents inside a repeat section tells the LLM to resolve relative to the array item schema at that collection path.

## LLM call — all-in-one pass

**Model:** Qwen3-8B via Ollama, `/no_think` mode (per LLM surface table).

**Input:**
- Full raw JSON Schema
- Extracted intent list with structural context
- Instruction to return a JSON array, one mapping object per intent

**Required output per intent:**
```json
{
  "intent_key":   "fi_c",
  "field_path":   "invoice.total",
  "confidence":   "medium",
  "alternatives": ["invoice.subtotal", "invoice.amount_due"],
  "display_name": "Invoice total"
}
```

**Field path semantics by intent type:**
- `field` (top-level): absolute dot-notation path from schema root, e.g. `customer.name`
- `field` (nested in repeat): path relative to the collection item, e.g. `description` (not `invoice.items[].description`)
- `repeat`: path to the array field, e.g. `invoice.items`
- `condition`: condition expression string, e.g. `invoice.status == "paid"`. The condition tree is constructed from this string separately via the existing condition pipeline.

**Unresolvable intents:** `field_path: null`, `confidence: "unresolved"`, `alternatives: []`.

**Max alternatives:** 3.

## LLM call — selective re-resolution

Targets a single intent. Input is identical to the all-in-one call, with two differences:
- `intent_key` parameter specifies the target intent
- All other intents' current mappings are included in the prompt as context (so the LLM avoids duplicating an already-resolved path)

Returns one mapping object for the target intent only.

## API

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/templates/{id}/schema/resolve` | Trigger resolution. Body: `{}` for all-in-one; `{ "intent_key": "..." }` for selective |

Resolution runs asynchronously. The endpoint returns `202 Accepted` with a job indicator. The client re-fetches `GET /api/templates/{id}/schema` to pick up updated mappings.

## Mapping write-back

After resolution completes:
1. `intent_mappings` records are created (all-in-one) or updated (selective)
2. Block model intent nodes are updated:
   - `fieldIntent`: `field_path` and `display_name` written
   - `section` (repeat): `collection_path` and `display_name` written
   - `section` (condition): `display_name` written; condition tree constructed from expression string and written to existing `condition_tree` field
3. Updated block model is saved (triggers Typst recompile)

## Conflict detection

If two intents resolve to the same `field_path`, both are flagged as `confidence: "low"` with a note in the UI: "Same field as [other intent label]". The LLM is instructed to avoid this, but the system detects it post-resolution as a fallback.

## Triggers

| Trigger | Resolution type | Initiated by |
|---|---|---|
| Schema uploaded | All-in-one | Automatic |
| New intent added to template | Selective | Automatic |
| Intent label edited | Selective | Automatic |
| User clicks retry on a mapping row | Selective | User |
| User clicks "Re-resolve all" | All-in-one | User |
