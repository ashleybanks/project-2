## Purpose

Defines the stylesheet editor component: the `StylesheetDef` data model, font selection, colour input controls, accordion grouping, and per-style fields. Used in both the Stylesheets area (brand rules) and the template editor's Styles tab.

## Requirements

### Requirement: StylesheetDef data model
The system SHALL use a structured `StylesheetDef` type for all stylesheet data, replacing the previous flat `BrandRules` type. `StylesheetDef` SHALL contain two global font tokens (`headingFont`, `bodyFont`), two global colour tokens (`headingColour`, `bodyColour`), and per-style entries for `normal`, `h1`–`h6`, `tableHeader`, and `tableData`. All numeric measurements SHALL be in points (`pt`).

#### Scenario: StylesheetDef shape accepted by API
- **WHEN** a client submits a `StylesheetDef` payload to `PUT /stylesheets/brand-rules` or `PUT /templates/:id`
- **THEN** the server SHALL store it as-is in the relevant JSONB column without transformation

#### Scenario: Partial stylesheet accepted
- **WHEN** a `StylesheetDef` payload omits some fields (e.g. no `h4`, no `tableHeader`)
- **THEN** the server SHALL store it successfully; omitted fields are treated as unset

---

### Requirement: Curated font list
The stylesheet editor SHALL offer a curated dropdown of fonts. The list SHALL be fixed and grouped by category (sans-serif, serif). Carlito SHALL be included and labelled "Carlito (Calibri-compatible)". No free-text font entry SHALL be accepted.

**Font list:**
- Sans-serif: Inter, Roboto, Open Sans, Lato, Montserrat, Source Sans 3, Nunito
- Serif: Merriweather, Playfair Display, Lora, EB Garamond, Libre Baskerville
- Special: Carlito (Calibri-compatible)

#### Scenario: Font dropdown shows grouped options
- **WHEN** a user opens the heading font or body font dropdown
- **THEN** fonts SHALL be displayed in labelled groups (Sans-serif / Serif / Special)

#### Scenario: Carlito labelled as Calibri-compatible
- **WHEN** a user opens the font dropdown
- **THEN** Carlito SHALL appear as "Carlito (Calibri-compatible)" in the Special group

---

### Requirement: Colour input with swatch
Colour fields (heading colour, body colour, table line colour) SHALL be presented as a hex text input paired with a colour swatch. The swatch SHALL reflect the current hex value. Clicking the swatch SHALL open a native colour picker.

#### Scenario: Swatch reflects current value
- **WHEN** a colour field has a hex value set
- **THEN** the swatch SHALL display that colour as its background

#### Scenario: Native picker updates hex input
- **WHEN** a user selects a colour via the native colour picker
- **THEN** the hex input field SHALL update to the selected colour's hex value

#### Scenario: Manual hex entry updates swatch
- **WHEN** a user types a valid 6-digit hex value into the colour text input
- **THEN** the swatch SHALL update to reflect the new colour

---

### Requirement: Accordion grouping
The stylesheet editor SHALL organise per-style entries into three collapsible accordion groups: Heading styles, Text styles, and Table styles. Global tokens (heading font, body font, heading colour, body colour) SHALL appear above the accordion and SHALL always be visible.

#### Scenario: Global tokens always visible
- **WHEN** the stylesheet editor is open
- **THEN** heading font, body font, heading colour, and body colour SHALL be visible regardless of accordion state

#### Scenario: Accordion groups collapse and expand
- **WHEN** a user clicks an accordion group header
- **THEN** the group SHALL toggle between expanded and collapsed

---

### Requirement: Per-style fields
Each per-style entry in the accordion SHALL present three fields: font size (pt), spacing before (pt), spacing after (pt). The `normal` style SHALL additionally show indent size (pt). Table styles SHALL additionally show line width (pt) and line colour.

#### Scenario: Heading style fields shown
- **WHEN** a heading style entry (e.g. H1) is expanded
- **THEN** the entry SHALL show font size, spacing before, and spacing after fields

#### Scenario: Text style fields shown
- **WHEN** the Normal entry is expanded
- **THEN** the entry SHALL show font size, spacing before, spacing after, and indent size fields

#### Scenario: Table style fields shown
- **WHEN** a table style entry is expanded
- **THEN** the entry SHALL show font size, spacing before, spacing after, line width, and line colour fields
