## 1. Lists — Model and Compiler

- [x] 1.1 Add `list_item: Option<String>` and `level: Option<u32>` (both `#[serde(default)]`) to `model::PtBlock`. Update `frontend_model::map_frontend_block` to pass these fields through from `FrontendBlock`.
  **Acceptance:** `cargo test -p typst-compiler` still passes; a manually constructed `PtBlock` with `list_item: Some("bullet")` round-trips through serde without error.

- [x] 1.2 Write failing tests in `compiler.rs` for list rendering: bullet item emits `- content`, numbered item emits `+ content`, level-2 bullet emits `  - content`.
  **Acceptance:** Tests exist and fail (compile succeeds, assertions fail) before the compiler is updated.

- [x] 1.3 Update `compile_pt_block` in `compiler.rs` to handle `list_item`. When `list_item` is `"bullet"`, prefix with `"  ".repeat(level-1) + "- "`. When `"number"`, prefix with `"  ".repeat(level-1) + "+ "`. Existing non-list path unchanged.
  **Acceptance:** The three tests from 1.2 pass. All existing compiler tests continue to pass.

- [x] 1.4 Write a failing test in `frontend_model.rs`: a `FrontendBlock` with `listItem: "bullet"` passed through `map_to_block_model` + `compile()` produces source containing `- `.
  **Acceptance:** Test exists and fails before 1.3; passes after 1.3.

## 2. Tables — Model and Compiler

- [x] 2.1 Add `TableBlock`, `TableRow`, and `TableCell` structs to `model.rs`. `TableBlock` holds `rows: Vec<TableRow>`; `TableRow` holds `cells: Vec<TableCell>` and `is_header: bool`; `TableCell` holds `content: Vec<PtBlock>`. Add `Block::Table(TableBlock)` variant to the `Block` enum.
  **Acceptance:** `cargo build -p typst-compiler` compiles clean; `Block::Table` is reachable via pattern match without warnings.

- [x] 2.2 Write failing tests in `compiler.rs` for table rendering: correct `columns:` count, `table.header(...)` present for header rows, cell text appears in `[...]` blocks.
  **Acceptance:** Tests exist and fail before the compile function is updated.

- [x] 2.3 Implement `compile_table_block` in `compiler.rs`. Derive column count from `rows[0].cells.len()` (default 1 if empty). Emit `#table(columns: N,\n  <rows>\n)`. Header rows emit `table.header(<cells>)`. Each cell emits `[<compiled content>]`. Add `Block::Table(t) => compile_table_block(t)` arm to `compile_block`.
  **Acceptance:** The tests from 2.2 pass. All existing tests continue to pass.

- [x] 2.4 Update `frontend_model.rs`: replace the `FrontendTopLevel::Table(_) => vec![]` arm. Map `FrontendTable` → `Block::Table(TableBlock)`. Rows come from `FrontendTable.rows`; cells from the row's `cells` array; `is_header` from `FrontendTableCell.isHeader`; cell content from `FrontendTableCell.content` (which is `Vec<FrontendBlock>`).
  **Acceptance:** A `FrontendTable` JSON round-tripped through `map_to_block_model` + `compile()` produces a `#table(` expression. Add a unit test to `frontend_model.rs` verifying this.

## 3. Stylesheet — Compiler Signature and Preamble

- [x] 3.1 Write failing tests in `compiler.rs` for stylesheet application: `bodyFont: "Helvetica"` → source contains `font: "Helvetica"`; `headingFont: "Georgia"` → source contains a heading show rule with `font: "Georgia"`; `headingColour: "#1a1a2e"` → source contains `fill: rgb("#1a1a2e")`; `None` stylesheet → source contains `"New Computer Modern"`.
  **Acceptance:** Tests exist and fail (the current hardcoded preamble doesn't vary with input).

- [x] 3.2 Change `compile(model: &BlockModel)` to `compile(model: &BlockModel, stylesheet: Option<&StylesheetDef>)` in `compiler.rs`. Update `preamble()` to accept `Option<&StylesheetDef>` and emit conditional `#set text`, `#set par`, and `#show heading` directives. Update all existing callers (`wasm.rs`, `render_test.rs`, internal test calls) to pass `None`.
  **Acceptance:** All existing tests pass with `None`. The four tests from 3.1 pass.

- [x] 3.3 Update `wasm.rs`: deserialize `_stylesheet_json` into `Option<StylesheetDef>` (return `None` on empty string or parse failure, don't error). Pass it to `compile()`.
  **Acceptance:** A `render_preview` call with a stylesheet JSON containing `bodyFont: "Latin Modern Roman"` produces Typst source with that font name. Add a unit test in `frontend_model.rs` (or a new `wasm_tests` module) verifying this at the source level.

## 4. WASM Rebuild and Verification

- [x] 4.1 Rebuild the WASM module (`just wasm-build`) and reinstall in the web app (`npm install` in `apps/web`). Verify the dev server starts without errors.
  **Acceptance:** `just wasm-build` completes; `npm run dev` in `apps/web` starts without WASM import errors; opening a template and switching to Preview shows a PDF with correct list markers, a visible table, and fonts from the stylesheet.
