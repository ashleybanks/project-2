## Purpose

Defines the behaviour of the in-browser WASM-based preview in the template workspace. Users can switch to Preview mode at any time to render the current block model to SVG via the Typst WASM renderer, without leaving the editor.

---

## Requirements

### Requirement: Preview tab is enabled
The Preview mode button in the template workspace SHALL be enabled and clickable for all templates, regardless of whether intents have been resolved or data has been loaded.

#### Scenario: Preview tab is enabled on page load
- **WHEN** a user opens any template in the workspace
- **THEN** the Preview mode button is enabled and not visually disabled

#### Scenario: Preview tab is clickable
- **WHEN** a user clicks the Preview mode button
- **THEN** the workspace switches to Preview mode

---

### Requirement: Preview tab renders SVG, not PDF
The Preview mode SHALL render the template as SVG using the `render_preview_svg` / `render_preview_with_data_svg` WASM exports. The PDF iframe is removed. The SVG is displayed as a vertically stacked sequence of pages in the preview area (see `svg-preview` spec).

#### Scenario: Render triggered on Preview tab switch
- **WHEN** a user switches to the Preview tab
- **THEN** `render_preview_svg` (or `render_preview_with_data_svg` if a record is selected) is called
- **THEN** the resulting SVG pages are rendered in the preview area

#### Scenario: Plain text blocks render correctly
- **WHEN** the template contains only text blocks with spans (no fieldIntent nodes, no sections)
- **THEN** the rendered SVG contains the template text with correct heading levels and paragraph styles

#### Scenario: Empty template renders without error
- **WHEN** the template has no blocks
- **THEN** the preview renders a blank page SVG without error

#### Scenario: Loading state shown during SVG render
- **WHEN** the WASM render is in-flight
- **THEN** a loading indicator is shown in the preview area

---

### Requirement: Render errors are surfaced to the user
The system SHALL display an error message if the WASM render fails, rather than showing a blank or broken state.

#### Scenario: Render error is shown
- **WHEN** the WASM SVG render returns an error
- **THEN** a human-readable error message is shown
- **THEN** the user can switch to another tab without being stuck

---

### Requirement: WASM module is loaded lazily
The system SHALL not load the WASM module until the user first switches to Preview mode.

#### Scenario: WASM not loaded on template page open
- **WHEN** a user opens a template but does not switch to Preview mode
- **THEN** the WASM binary is not fetched or instantiated

#### Scenario: WASM loaded once per session
- **WHEN** a user switches to Preview mode multiple times in one session
- **THEN** the WASM module is initialised only once and reused for subsequent renders

