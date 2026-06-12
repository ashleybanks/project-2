# Spec: PDF Rendering

## Purpose

TBD — this capability covers compilation of the block model to Typst source and in-process rendering of that source to PDF bytes, including Wasm build portability of the compiler crate.

---

## Requirements

### Requirement: Block model compiles to Typst source
The system SHALL compile a block model (containing Text, Repeating Section, and Conditional Section blocks) into valid Typst source. The compiled source SHALL reference payload data via `#let data = json("data.json")` so that data injection at render time is decoupled from compilation.

#### Scenario: Text block with plain content compiles
- **WHEN** a Text block contains a Portable Text document with plain spans
- **THEN** the compiler SHALL emit the text content as a Typst paragraph

#### Scenario: Text block with bold mark compiles
- **WHEN** a Text block contains a Portable Text span with the "strong" mark
- **THEN** the compiler SHALL emit `*text*` for that span in the Typst output

#### Scenario: Merge field compiles to data reference
- **WHEN** a Text block contains a Portable Text `mergeField` node with `field: "invoice.total"`
- **THEN** the compiler SHALL emit `#data.invoice.total` in the Typst output

#### Scenario: Repeating Section compiles to for loop
- **WHEN** a Repeating Section block references array field `invoice.items`
- **THEN** the compiler SHALL emit a Typst `#for item in data.invoice.items` loop containing the compiled child blocks

#### Scenario: Repeating Section with empty state compiles to if/else
- **WHEN** a Repeating Section block has an empty-state slot defined
- **THEN** the compiler SHALL emit a Typst `#if data.field.len() > 0 [...] else [...]` wrapping the loop

#### Scenario: Conditional Section with passing condition compiles
- **WHEN** a Conditional Section block has a condition tree `{ EQ, "invoice.status", "paid" }`
- **THEN** the compiler SHALL emit `#if data.invoice.status == "paid" [...]` in the Typst output

#### Scenario: Unknown Portable Text node type surfaces an error
- **WHEN** the compiler encounters a Portable Text node type it does not recognise
- **THEN** the compiler SHALL return an error identifying the unknown node type, rather than silently dropping it

---

### Requirement: Typst source renders to PDF bytes in-process
The system SHALL render a Typst source string and a JSON payload into PDF bytes entirely in-process, with no subprocess spawning and no disk I/O. The rendering SHALL use a virtual in-memory file system providing the Typst source and payload JSON.

#### Scenario: Hardcoded template renders without error
- **WHEN** the `GET /api/render/test` endpoint is called
- **THEN** the system SHALL return HTTP 200 with `Content-Type: application/pdf` and a valid PDF document in the response body

#### Scenario: Payload data appears in the rendered PDF
- **WHEN** the hardcoded payload contains `{ "customer": { "name": "Acme Corp" } }` and the template references `customer.name`
- **THEN** the rendered PDF SHALL contain the text "Acme Corp"

#### Scenario: Conditional section respects payload
- **WHEN** the hardcoded payload contains `{ "invoice": { "status": "paid" } }` and the template has a conditional section visible only when `invoice.status == "paid"`
- **THEN** the conditional content SHALL appear in the rendered PDF

#### Scenario: Repeating section iterates payload array
- **WHEN** the hardcoded payload contains an `invoice.items` array with two entries
- **THEN** the rendered PDF SHALL contain two line item rows

---

### Requirement: Compiler crate builds to Wasm
The `crates/typst-compiler` crate SHALL compile successfully to the `wasm32-unknown-unknown` target. It SHALL have no dependencies that prevent Wasm compilation (no Axum, no tokio, no filesystem I/O in the compiler logic itself).

#### Scenario: Wasm build succeeds
- **WHEN** `cargo build --target wasm32-unknown-unknown -p typst-compiler` is run
- **THEN** the build SHALL complete without errors

#### Scenario: Wasm binary size is documented
- **WHEN** the Wasm build completes
- **THEN** the uncompressed `.wasm` binary size SHALL be measured and recorded in the spike findings document

---

### Requirement: List blocks compile to Typst list syntax
The system SHALL compile Portable Text blocks with `listItem: "bullet"` to Typst `- item` syntax and `listItem: "number"` to Typst `+ item` syntax. Nesting SHALL be expressed by prepending two spaces per level above 1.

#### Scenario: Bullet list item compiles
- **WHEN** a Text block contains a PT block with `listItem: "bullet"` and `level: 1`
- **THEN** the compiler SHALL emit `- <content>` for that block

#### Scenario: Numbered list item compiles
- **WHEN** a Text block contains a PT block with `listItem: "number"` and `level: 1`
- **THEN** the compiler SHALL emit `+ <content>` for that block

#### Scenario: Nested bullet list item compiles with indentation
- **WHEN** a PT block has `listItem: "bullet"` and `level: 2`
- **THEN** the compiler SHALL emit `  - <content>` (two leading spaces) for that block

#### Scenario: Frontend list block maps and compiles correctly
- **WHEN** a `FrontendBlock` with `listItem: "bullet"` is passed to `render_preview`
- **THEN** the compiled Typst source SHALL contain `- <content>`

---

### Requirement: Table blocks compile to Typst table syntax
The system SHALL compile Table blocks into a Typst `#table(...)` call. The column count SHALL be derived from the first row. Header rows SHALL be wrapped in `table.header(...)`. Each cell's content SHALL be compiled as a Typst content block `[...]`.

#### Scenario: Simple table compiles with correct column count
- **WHEN** a Table block has rows with 3 cells each
- **THEN** the compiler SHALL emit `#table(columns: 3, ...)` in the Typst output

#### Scenario: Header row wrapped in table.header
- **WHEN** a Table block has a first row where `is_header: true`
- **THEN** the compiler SHALL emit `table.header([...], [...])` for that row's cells

#### Scenario: Body cells emitted as content blocks
- **WHEN** a Table block has non-header rows
- **THEN** each cell's text content SHALL appear as `[cell text]` in the Typst output

#### Scenario: Frontend table maps and compiles correctly
- **WHEN** a `FrontendTable` is passed to `render_preview`
- **THEN** the compiled Typst source SHALL contain a `#table(` expression

---

### Requirement: Stylesheet applied to Typst preamble
The system SHALL apply font family, heading font, body colour, heading colour, and paragraph spacing from a `StylesheetDef` to the generated Typst preamble when a stylesheet is provided. When no stylesheet is provided, or when individual fields are absent, the compiler SHALL fall back to built-in defaults.

#### Scenario: Body font applied when set
- **WHEN** `StylesheetDef.bodyFont` is `"Helvetica"`
- **THEN** the compiled Typst source SHALL contain `#set text(font: "Helvetica")`

#### Scenario: Heading font applied when set
- **WHEN** `StylesheetDef.headingFont` is `"Georgia"`
- **THEN** the compiled Typst source SHALL contain a heading show rule applying `font: "Georgia"`

#### Scenario: Heading colour applied when set
- **WHEN** `StylesheetDef.headingColour` is `"#1a1a2e"`
- **THEN** the compiled Typst source SHALL contain a heading show rule applying `fill: rgb("#1a1a2e")`

#### Scenario: Fallback to defaults when stylesheet is None
- **WHEN** `compile()` is called with `stylesheet: None`
- **THEN** the compiled Typst source SHALL contain `"New Computer Modern"` as the font

#### Scenario: Stylesheet applied end-to-end via render_preview
- **WHEN** `render_preview` is called with a stylesheet JSON containing `bodyFont: "Latin Modern Roman"`
- **THEN** the compiled Typst source SHALL contain `"Latin Modern Roman"`
