## Why

The WASM preview renders a PDF, but three content types — lists, tables, and styled text — are either silently dropped or rendered with hardcoded defaults. A template that uses any of these will look wrong in preview (and in any future server-side render), breaking the core value proposition of "see what you'll get."

## What Changes

- **List rendering**: `model::PtBlock` gains `list_item` and `level` fields. `compile_pt_block` emits Typst list syntax (`-` for bullets, `+` for numbered, indented by level). The frontend mapper in `frontend_model.rs` passes these fields through.
- **Table rendering**: `Block` gains a `Table` variant. A `compile_table_block` function emits a Typst `#table(...)` expression with correct column count, header row distinction, and cell content. The frontend mapper stops silently dropping `FrontendTable`.
- **Stylesheet application**: `compile()` gains a `stylesheet: Option<&StylesheetDef>` parameter. The generated preamble applies font family, font size, heading colour, and paragraph spacing from the stylesheet when present, falling back to current hardcoded defaults when absent. The WASM entry point `render_preview` passes the parsed stylesheet through.
- **Test coverage**: Each behaviour is verified at the Typst source level in `compiler.rs` and `frontend_model.rs` unit tests, following the same pattern as existing tests.

## Capabilities

### New Capabilities

*(none)*

### Modified Capabilities

- `pdf-rendering`: Adding requirements for list rendering, table rendering, and stylesheet application to Typst output. These are new compiler behaviours not currently specified.

## Non-goals

- Full Typst table styling (border widths, cell colours, column widths) — basic structural rendering only.
- Applying `tableHeader` / `tableData` cell styles from the stylesheet — deferred to a styling pass.
- `h4`–`h6` heading levels — currently unsupported in the editor; not introduced here.
- Italic/underline/strikethrough marks in the preamble — already handled at the span level.
- Server-side render endpoint — still deferred.

## Impact

- `crates/typst-compiler/src/model.rs` — `PtBlock` gains `list_item`/`level`; `Block` gains `Table` variant
- `crates/typst-compiler/src/compiler.rs` — list and table compile functions; `compile()` signature change
- `crates/typst-compiler/src/frontend_model.rs` — mapper updates for lists and tables
- `crates/typst-compiler/src/wasm.rs` — pass stylesheet to `compile()`
- `openspec/specs/pdf-rendering/spec.md` — new requirements for list, table, and stylesheet rendering
- WASM rebuild required after Rust changes
- Phase: Template Builder (Phase 1)
