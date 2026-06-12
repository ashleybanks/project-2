## ADDED Requirements

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
