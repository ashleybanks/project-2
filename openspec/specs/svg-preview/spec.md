## Purpose

Defines the SVG-based in-browser preview: new WASM exports for SVG rendering, the page layout surface, the Fields/Data toggle, and interactive intent chip overlays.

## Requirements

### Requirement: WASM compiler exports SVG render functions
The `typst-compiler` crate SHALL export `render_preview_svg` and `render_preview_with_data_svg` WASM functions alongside the existing PDF exports. The SVG exports SHALL accept the same arguments as their PDF counterparts.

#### Scenario: SVG render produces valid SVG output
- **WHEN** `render_preview_svg(blocks_json, stylesheet_json, font_data)` is called with a valid block model
- **THEN** the function returns a `Vec<String>` where each element is one page's SVG markup
- **THEN** each SVG is a well-formed `<svg>` element with explicit `width` and `height` attributes

#### Scenario: SVG render with data produces merged output
- **WHEN** `render_preview_with_data_svg(blocks_json, stylesheet_json, data_json, font_data)` is called
- **THEN** field intent merge fields in the output reflect the values from `data_json`

#### Scenario: Existing PDF exports are unchanged
- **WHEN** `render_preview` or `render_preview_with_data` are called
- **THEN** they produce PDF bytes as before; the SVG exports are additive

---

### Requirement: Preview tab renders SVG with page layout
The Preview tab SHALL render the SVG pages returned by the WASM export as a vertically stacked sequence with a page gap between pages, replacing the PDF iframe.

#### Scenario: Single-page document renders one SVG
- **WHEN** the WASM SVG export returns one page
- **THEN** one SVG element is rendered in the preview area at full width

#### Scenario: Multi-page document stacks pages vertically
- **WHEN** the WASM SVG export returns N pages
- **THEN** N SVG elements are rendered in a vertically scrollable container with a visible gap between pages

#### Scenario: SVG scales to available width
- **WHEN** the preview panel width changes
- **THEN** the SVG scales proportionally to fit the available width while preserving aspect ratio

---

### Requirement: Fields/Data toggle in Preview toolbar
The Preview tab SHALL provide a toggle in the toolbar to switch between Fields mode (intent chip overlays visible) and Data mode (merged values, no overlays). The toggle SHALL not trigger a WASM re-render.

#### Scenario: Fields mode shows intent overlay layer
- **WHEN** the user selects Fields mode
- **THEN** an overlay layer is shown above the SVG containing intent chip markers positioned to match their location in the document
- **THEN** the underlying SVG shows template structure without merged values

#### Scenario: Data mode hides overlay layer
- **WHEN** the user selects Data mode
- **THEN** the overlay layer is hidden
- **THEN** the SVG shows merged data values (if a record is selected)

#### Scenario: Toggle is instant — no WASM re-render
- **WHEN** the user switches between Fields and Data mode
- **THEN** the switch is immediate (CSS show/hide only)
- **THEN** no new WASM render is triggered

---

### Requirement: Intent chip overlays are interactive in Fields mode
In Fields mode, intent chip overlays SHALL be positioned over their corresponding locations in the SVG. Clicking a chip SHALL open a popover for that intent.

#### Scenario: Field intent chip positioned correctly
- **WHEN** Fields mode is active and a `fieldIntent` exists in the document
- **THEN** an intent chip overlay is positioned at the corresponding location in the SVG

#### Scenario: Clicking an intent chip opens a popover
- **WHEN** a user clicks an intent chip overlay in Fields mode
- **THEN** a popover opens showing the intent's label, resolved field path, and expression (if any)
- **THEN** the popover offers an edit action for the expression (natural language input)

#### Scenario: Field intents with expressions show indicator
- **WHEN** a field intent has an `expression` set
- **THEN** the intent chip in Fields mode displays a format indicator (e.g. `ƒ` suffix)
- **WHEN** in Data mode
- **THEN** the raw field value is shown with the same `ƒ` indicator to signal that server rendering will apply a transform
