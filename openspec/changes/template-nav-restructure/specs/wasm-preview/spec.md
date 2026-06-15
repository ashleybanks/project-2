## MODIFIED Requirements

### Requirement: Preview tab renders SVG, not PDF
The Preview mode SHALL render the template as SVG using the new `render_preview_svg` / `render_preview_with_data_svg` WASM exports. The PDF iframe is removed. The SVG is displayed as a vertically stacked sequence of pages in the preview area.

#### Scenario: Render triggered on Preview tab switch
- **WHEN** a user switches to the Preview tab
- **THEN** `render_preview_svg` (or `render_preview_with_data_svg` if a record is selected) is called
- **THEN** the resulting SVG pages are rendered in the preview area

#### Scenario: Loading state shown during SVG render
- **WHEN** the WASM render is in-flight
- **THEN** a loading indicator is shown in the preview area

#### Scenario: Render errors are surfaced to the user
- **WHEN** the WASM SVG render returns an error
- **THEN** a human-readable error message is shown
- **THEN** the user can switch to another tab without being stuck

---

## REMOVED Requirements

### Requirement: PDF is displayed in the preview area
**Reason:** Replaced by SVG rendering. The PDF iframe is incompatible with the intent chip overlay layer and does not support interactive elements.
**Migration:** Server-side PDF generation is unaffected. The in-browser preview changes from PDF iframe to SVG element(s). The existing `render_preview` and `render_preview_with_data` PDF exports are retained for server use.

### Requirement: Manual refresh re-renders the preview
**Reason:** Preview is now connected to the active job's record set and re-renders automatically on record selection change. A manual refresh button is no longer needed.
**Migration:** None — the control is removed. Users step through records using ‹ › navigation to trigger re-renders.
