# Design: Template Schema

## Data model

### Schema entity

```
template_schemas
  id            uuid  PK
  template_id   uuid  FK → templates
  raw_schema    jsonb   (original JSON Schema as uploaded)
  created_at    timestamptz
```

One schema per template for now. Future versioning (tied to template versions and batches) is deferred.

### Mapping entity

```
intent_mappings
  id              uuid  PK
  schema_id       uuid  FK → template_schemas
  intent_key      text    (_key of intent node in block model)
  intent_label    text    (original natural language label)
  intent_type     enum { field, repeat, condition }
  display_name    text    (LLM-suggested; user-editable)
  field_path      text?   (null if unresolved; relative path for nested intents)
  confidence      enum { high, medium, low, unresolved }
  alternatives    text[]  (up to 3 alternative paths the LLM considered)
  parent_key      text?   (_key of parent repeat section for nested field intents)
```

### Block model additions

Two intent nodes gain optional resolved fields. These are the denormalized values used by the Typst compiler — the mapping entity remains the source of truth for UI metadata.

```typescript
// Existing fields preserved; new fields optional
interface PtFieldIntent {
  _type: "fieldIntent"
  _key: string
  label: string           // user's original natural language label — immutable
  display_name?: string   // LLM-suggested display label; shown in chip
  field_path?: string     // resolved path, e.g. "customer.name"
}

interface PtSection {
  _type: "section"
  _key: string
  conditionIntent?: string
  repeatIntent?: string
  display_name?: string       // LLM-suggested display label
  collection_path?: string    // for repeat sections: "invoice.items"
  condition_tree?: ConditionTree  // for condition sections: already in architecture
}
```

---

## The three-level intent representation

Each intent has three distinct representations that serve different purposes:

```
1. Original label    "total amount due"     — what the author typed; immutable anchor
2. Display name      "Invoice total"         — shown in chips and doc map; LLM-suggested, user-editable
3. Field path        invoice.total           — technical binding; used in Typst compilation
```

Level 1 is preserved forever. Level 2 is what the user sees in normal operation. Level 3 is what the system uses to generate documents.

---

## Resolution algorithm

### Intent extraction

Before calling the LLM, walk the block model depth-first to extract all intents with structural context:

```
Top-level:
  { key: "fi_a", label: "customer's full name",  type: "field",     parent_key: null }
  { key: "fi_b", label: "invoice date",          type: "field",     parent_key: null }
  { key: "fi_c", label: "total amount due",      type: "field",     parent_key: null }
  { key: "s_1",  label: "one row per line item", type: "repeat",    parent_key: null }

Nested inside s_1:
  { key: "fi_d", label: "item description",      type: "field",     parent_key: "s_1" }
  { key: "fi_e", label: "unit price",            type: "field",     parent_key: "s_1" }

  { key: "s_2",  label: "show when paid",        type: "condition", parent_key: null }
```

The `parent_key` tells the LLM that `fi_d` and `fi_e` should resolve relative to the array item schema at `s_1`'s collection path — not to the root schema object.

### All-in-one LLM pass

Single LLM call (Qwen3-8B, `/no_think` mode). Input:
- Full raw JSON Schema
- Extracted intents with structural context as above
- Instruction: produce one mapping per intent as structured JSON

Required output per intent:
```json
{
  "intent_key":   "fi_c",
  "field_path":   "invoice.total",
  "confidence":   "medium",
  "alternatives": ["invoice.subtotal", "invoice.amount_due"],
  "display_name": "Invoice total"
}
```

For nested (repeat-child) intents: `field_path` is relative to the collection item (e.g. `description`, not `invoice.items[].description`).
For repeat intents: `field_path` is the collection path (e.g. `invoice.items`).
For condition intents: `field_path` is the condition expression string (e.g. `invoice.status == "paid"`). The condition tree is constructed from this separately.
If unresolvable: `field_path: null`, `confidence: "unresolved"`.

### Selective re-resolution

Targets one intent. Input is the same as all-in-one, but:
- `intent_key` specifies the target
- All other intents' existing mappings are included as context
- Only the target mapping is returned and updated

This keeps selective resolution coherent — the LLM knows what's already resolved and avoids conflicts.

### Triggers

| Trigger | Resolution type |
|---|---|
| Schema uploaded | All-in-one (all intents) |
| New fieldIntent added to template | Selective (new intent only) |
| Intent label edited | Selective (changed intent) |
| User clicks "Retry" on a mapping row | Selective (that intent) |
| User clicks "Re-resolve all" | All-in-one (replaces all mappings) |

### Mapping write-back

After any resolution:
1. `intent_mappings` records created or updated
2. Block model intent nodes updated with `field_path` and `display_name`
3. Template saved (triggers Typst recompile if field paths changed)

---

## Confidence scoring

The LLM self-reports confidence as `high / medium / low / unresolved`. Three-dot visual indicator:

| Confidence | Indicator | Meaning | UI treatment |
|---|---|---|---|
| high | ●●● | Clear match, no ambiguity | Resolved silently |
| medium | ●●○ | Plausible, alternatives exist | Alternatives shown inline |
| low | ●○○ | Uncertain | Amber tint; alternatives shown; user should review |
| unresolved | ○○○ | No match found | Muted; [Fix ▾] affordance |

None of these states block test data generation or any other action.

---

## Data tab layout

The Data tab has three stacked sections when a schema exists:

```
┌─────────────────────────────────────────────────────────────────┐
│ Schema                                    invoice-schema.json    │
│ Uploaded Jun 12, 2025  ·  14 fields       [Replace] [View ↗]   │
├─────────────────────────────────────────────────────────────────┤
│ Mappings                                  [Re-resolve all]       │
│                                                                  │
│  customer's full name    →  customer.name          ●●●           │
│  invoice date            →  invoice.date           ●●●           │
│  total amount due        →  invoice.total          ●●○           │
│    also: invoice.subtotal, invoice.amount_due  [Change ▾]        │
│  ↻ one row per line item →  invoice.items[]        ●●●           │
│      item description    →  description            ●●●           │
│      unit price          →  price                  ●●○           │
│  ⊘ show when paid        →  invoice.status=="paid" ●●○           │
│                                                                   │
│  payment terms           →  not resolved           ○○○  [Fix ▾]  │
├─────────────────────────────────────────────────────────────────┤
│ Test data                                                        │
│ [Generate 10 records]                                            │
└─────────────────────────────────────────────────────────────────┘
```

No-schema empty state shows a single upload prompt. The Mappings and Test data sections are hidden until a schema exists.

### Mapping row interactions

- **Hover a resolved row**: [Change ▾] appears
- **Click [Change ▾]**: dropdown of alternatives + "Search schema fields…" + "Enter path manually"
- **Click an alternative**: immediately updates mapping (no re-resolution needed — user is manually overriding)
- **[Fix ▾]** on unresolved: same dropdown, focused on field search
- **Row retry icon**: selective re-resolution for that intent
- **[Re-resolve all]**: all-in-one pass; asks "This will replace all current mappings. Continue?" (only confirm prompt in this feature)

---

## Build tab — Intent chip states

```
No schema:         [customer's full name]          blue chip, no indicator
Resolved (high):   [Customer name]          ✓      subtle check, display_name shown
Resolved (med):    [Invoice total]           ~      neutral indicator
Resolved (low):    [payment terms?]          !      amber indicator
Unresolved:        [payment terms]           –      muted chip
```

The chip label switches to `display_name` once resolved (if LLM produced a cleaner name).

---

## Build tab — Inspection popover

The existing intent popover gains a resolution section, shown only when a schema exists:

```
Resolved (medium confidence):
┌────────────────────────────────────────────┐
│ ◈ Invoice total                     ●●○    │
│ "total amount due"                         │
│ invoice.total  ·  number                   │
│ Also: invoice.subtotal, invoice.amount_due │
│ [Change ▾]  [Retry]  [Data tab ↗]         │
└────────────────────────────────────────────┘

Unresolved:
┌────────────────────────────────────────────┐
│ ◈ payment terms                     ○○○    │
│ "payment terms"                            │
│ Not mapped to schema                       │
│ [Fix in Data tab ↗]                        │
└────────────────────────────────────────────┘
```

"Data tab ↗" switches to the Data tab and scrolls to / highlights the relevant mapping row.

---

## Test data display

```
Generated (10 records):
┌─────────────────────────────────────────────────────────────────┐
│ Test data                            10 records  [↓ Export JSON]│
│                                                   [Regenerate]  │
├──────────────────┬──────────────┬───────────────┬───────────────┤
│ customer.name    │ invoice.date │ invoice.total │ invoice.items │
├──────────────────┼──────────────┼───────────────┼───────────────┤
│ Jane Smith       │ 2025-06-01   │ 480.00        │ 3 items       │
│ Acme Corp Ltd    │ 2025-06-03   │ 1200.00       │ 1 item        │
│ ...              │ ...          │ ...           │ ...           │
└──────────────────┴──────────────┴───────────────┴───────────────┘
```

Array fields show item count; clicking expands to a nested table of that record's items. Columns are root-level schema fields. Export downloads the full records array as JSON.
