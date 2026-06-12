## Context

The Typst compiler (`crates/typst-compiler`) currently handles plain text, headings, bold/italic spans, merge fields, repeating sections, and conditional sections. Three content types present in the frontend editor are either silently dropped or rendered incorrectly:

- **Lists**: `model::PtBlock` has no `list_item` or `level` fields. `compile_pt_block` falls through to the catch-all case, emitting list items as bare paragraphs with no markers or indentation.
- **Tables**: The frontend `FrontendTable` maps to `vec![]` in the mapper. `Block` has no `Table` variant. Tables are completely absent from rendered output.
- **Stylesheet**: `compile()` ignores `StylesheetDef` entirely. `preamble()` is hardcoded to `"New Computer Modern"` at `11pt`. The WASM entry point accepts `_stylesheet_json` but never uses it.

All three gaps are pure compiler issues — no API, database, or frontend changes required.

## Goals / Non-Goals

**Goals:**
- Lists compile to correct Typst list syntax with nesting support
- Tables compile to Typst `#table(...)` with correct column count and header rows
- `compile()` accepts a `StylesheetDef` and applies font family, font size, heading font/colour, and paragraph spacing
- Tests verify each behaviour at the Typst source level (not just render-to-PDF)
- WASM rebuilt and `render_preview` passes stylesheet through

**Non-Goals:**
- Table cell styling (borders, colours, padding) — basic structure only
- `tableHeader`/`tableData` stylesheet properties applied to cells
- `h4`–`h6` headings (not in the editor)
- Text alignment within list items

## Decisions

### 1. Add `list_item` and `level` directly to `model::PtBlock`

The existing `PtBlock` in `model.rs` lacks these fields. They are added as `Option<String>` and `Option<u32>` with `#[serde(default)]`.

**Alternative**: A separate `ListItemBlock` variant in `Block`. Rejected — list items in Portable Text are just blocks with extra attributes, not a structural wrapper. Adding fields to `PtBlock` mirrors the PT spec and the frontend model.

**Typst list syntax:**
```typst
- Bullet item        // listItem = "bullet", level = 1
  - Nested bullet    // listItem = "bullet", level = 2
+ Numbered item      // listItem = "number", level = 1
```
Indentation is produced by prepending `"  " * (level - 1)` spaces before the marker.

### 2. Add `Block::Table` variant with a flat cell list

The `Block` enum gains a `Table(TableBlock)` variant. `TableBlock` stores rows as `Vec<TableRow>`, each row as `Vec<TableCell>`, each cell as `Vec<PtBlock>`.

Typst table syntax:
```typst
#table(
  columns: N,
  table.header([H1], [H2]),
  [c1], [c2],
  [c3], [c4],
)
```
`table.header(...)` wraps cells whose row has `is_header: true`.

**Alternative**: Re-using `TextBlock` content for cell content. Rejected — a typed `TableBlock` makes the column-count derivation explicit and keeps the compiler logic readable.

### 3. `compile()` signature gains `stylesheet: Option<&StylesheetDef>`

Rather than a separate `compile_with_stylesheet()` function, the existing `compile()` signature changes. All callers pass `None` to get the current defaults. The WASM entry point parses and passes the stylesheet.

`StylesheetDef` fields applied:
| Field | Typst output |
|---|---|
| `body_font` | `#set text(font: "...")` |
| `heading_font` | `#show heading: set text(font: "...")` |
| `body_colour` | `#set text(fill: rgb("..."))` |
| `heading_colour` | `#show heading: set text(fill: rgb("..."))` |
| `normal.font_size` | `#set text(size: ...pt)` |
| `normal.spacing_before/after` | `#set par(spacing: ...)` |

Fields not in `StylesheetDef` or set to `None` fall back to the current hardcoded values.

### 4. Tests at the Typst source level, not PDF level

Following the established pattern in `compiler.rs` and `frontend_model.rs`: construct input, call `compile()`, assert the output string contains expected Typst syntax. No full render-to-PDF for these tests — that's slower and doesn't add signal for source-level correctness.

## Risks / Trade-offs

- **`compile()` signature change is breaking for existing callers** — only `wasm.rs` and `render_test.rs` call it directly. Both are in-repo. Update both as part of this change.
- **Typst list indentation via spaces** — Typst uses content indentation for nesting, not a nested list structure. Spaces before `-`/`+` is the idiomatic approach and matches what Typst's own tooling produces.
- **Column count derived from first row** — if rows have inconsistent cell counts, the table will mis-render. Acceptable for now; the editor enforces rectangular tables.

## Open Questions

- Should `h4`–`h6` be handled with a fallback (e.g., emit as bold paragraphs) rather than ignored? Currently they fall through to the normal paragraph case. Low priority; the editor doesn't expose them.
