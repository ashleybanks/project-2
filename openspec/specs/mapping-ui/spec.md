# Spec: Mapping UI

## Data tab — Schema upload area

### Empty state (no schema)

```
┌─────────────────────────────────────────────────────────────────┐
│ Schema                                                           │
│ Upload a JSON Schema to enable mappings, test data,             │
│ and merge validation.                                            │
│                                    [Upload JSON Schema]         │
└─────────────────────────────────────────────────────────────────┘
```

File input triggered by the button. Accepts `.json` only. Client validation runs before upload.

### Schema uploaded

```
┌─────────────────────────────────────────────────────────────────┐
│ Schema                                    invoice-schema.json    │
│ Uploaded Jun 12, 2025  ·  14 fields       [Replace] [View ↗]   │
└─────────────────────────────────────────────────────────────────┘
```

- **Replace**: triggers the file picker; confirmation prompt before upload ("Replacing the schema will clear all current mappings. Continue?")
- **View ↗**: opens the raw JSON Schema in a read-only code viewer (modal)

---

## Data tab — Mappings area

Shown below the schema area. Hidden until a schema exists.

### Loading state

While resolution is running:
```
Mappings
Resolving…  [spinner]
```

### Resolved state

```
Mappings                                          [Re-resolve all]
────────────────────────────────────────────────────────────────────
 customer's full name    →  customer.name              ●●●
 invoice date            →  invoice.date               ●●●
 total amount due        →  invoice.total              ●●○
   also: invoice.subtotal, invoice.amount_due  [Change ▾]
 ↻ one row per line item →  invoice.items[]            ●●●
     item description    →  description                ●●●
     unit price          →  price                      ●●○
 ⊘ show when paid        →  invoice.status == "paid"   ●●○

 payment terms           →  not resolved               ○○○  [Fix ▾]
```

- `↻` prefix on repeat intent rows
- `⊘` prefix on condition intent rows
- Nested intents (inside a repeat section) are indented by one level
- Condition intent field path shown as the expression string, not a raw path

### Row interactions

**Resolved row (high confidence):** No action visible by default. Retry icon on hover.

**Resolved row (medium/low confidence):**
- Alternatives shown inline below the row
- [Change ▾] button visible
- Clicking [Change ▾] opens a dropdown:
  - Listed alternatives (click to apply immediately)
  - "Search schema fields…" — type-to-filter all field paths from the raw schema
  - "Enter path manually" — free text input

**Unresolved row:**
- [Fix ▾] visible immediately (same dropdown as above)

**Any row:**
- Retry icon (↺) on hover runs selective re-resolution for that intent

**[Re-resolve all]:**
- Asks: "This will replace all current mappings. Continue?" (the one confirm prompt in this feature)
- Runs all-in-one pass on confirmation

### Display names

The left column (intent label) shows the original label as authored. It does not switch to the LLM's `display_name` here — the Data tab shows the original label so the author can verify the mapping makes sense given what they wrote.

---

## Build tab — Intent chip states

The existing chip component (`fieldIntent` rendered in the editor) gains a small status indicator appended to the right of the label:

| State | Chip label | Indicator | Style |
|---|---|---|---|
| No schema | Original `label` | — | Current blue |
| Resolved, high | `display_name` (falls back to `label`) | ✓ | Muted check |
| Resolved, medium | `display_name` | · | Neutral |
| Resolved, low | `display_name` | ! | Amber tint |
| Unresolved | Original `label` | – | Muted/gray chip |

The chip switches its displayed text to `display_name` once resolved (if the LLM provided a different value). The original `label` is always preserved in the node data.

---

## Build tab — Inspection popover

The existing intent popover (triggered by clicking a chip or the Intent toolbar button) is extended with a resolution section. This section is only shown when a schema exists on the template.

### Resolved (high or medium)

```
┌─────────────────────────────────────────────────────┐
│ ◈ Invoice total                            ●●○       │
│ "total amount due"                                   │  ← original label
│                                                      │
│ invoice.total  ·  number                             │  ← field path + type
│ Also: invoice.subtotal, invoice.amount_due           │  ← alternatives (if med/low)
│                                                      │
│ [Change ▾]   [↺ Retry]   [Data tab ↗]               │
└─────────────────────────────────────────────────────┘
```

- **[Change ▾]**: same dropdown as the mapping area (alternatives + search + manual)
- **[↺ Retry]**: selective re-resolution
- **[Data tab ↗]**: switches to Data tab and scrolls the mapping row into view

### Unresolved

```
┌─────────────────────────────────────────────────────┐
│ ◈ payment terms                            ○○○       │
│ "payment terms"                                      │
│                                                      │
│ Not mapped to schema                                 │
│ [Fix in Data tab ↗]                                  │
└─────────────────────────────────────────────────────┘
```

### No schema on template

The resolution section is not shown. The popover shows only the original intent creation UI (field/condition/repeat type selector and label input), as today.
