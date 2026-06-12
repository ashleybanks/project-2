## ADDED Requirements

### Requirement: Preview tab is enabled
The Preview mode button in the template workspace SHALL be enabled and clickable for all templates, regardless of whether intents have been resolved or data has been loaded.

#### Scenario: Preview tab is enabled on page load
- **WHEN** a user opens any template in the workspace
- **THEN** the Preview mode button is enabled and not visually disabled

#### Scenario: Preview tab is clickable
- **WHEN** a user clicks the Preview mode button
- **THEN** the workspace switches to Preview mode

---

### Requirement: WASM renderer produces a PDF from the current block model
The system SHALL compile the current editor's `PtTopLevel[]` blocks to a PDF using the in-browser Typst WASM renderer when the user switches to Preview mode.

#### Scenario: Render triggered on first Preview tab switch
- **WHEN** a user switches to Preview mode for the first time in a session
- **THEN** the WASM module is loaded and `render_preview` is called with the current blocks and stylesheet
- **THEN** a PDF is produced and displayed in the preview area

#### Scenario: Plain text blocks render correctly
- **WHEN** the template contains only text blocks with spans (no fieldIntent nodes, no sections)
- **THEN** the rendered PDF contains the template text with correct heading levels and paragraph styles

#### Scenario: Empty template renders without error
- **WHEN** the template has no blocks
- **THEN** the preview renders a blank page PDF without error

---

### Requirement: PDF is displayed in the preview area
The system SHALL display the rendered PDF as a blob URL in an `<iframe>` within the Preview tab area.

#### Scenario: PDF renders in preview area
- **WHEN** a render completes successfully
- **THEN** the preview area shows the PDF in an iframe filling the available space

#### Scenario: Loading state is shown during render
- **WHEN** the render is in-flight (WASM loading or compile running)
- **THEN** a loading indicator is shown in the preview area

---

### Requirement: Render errors are surfaced to the user
The system SHALL display an error message if the WASM render fails, rather than showing a blank or broken state.

#### Scenario: Render error is shown
- **WHEN** `render_preview` returns an error
- **THEN** the preview area shows a human-readable error message
- **THEN** the user can return to Build mode without being stuck

---

### Requirement: WASM module is loaded lazily
The system SHALL not load the WASM module until the user first switches to Preview mode.

#### Scenario: WASM not loaded on template page open
- **WHEN** a user opens a template but does not switch to Preview mode
- **THEN** the WASM binary is not fetched or instantiated

#### Scenario: WASM loaded once per session
- **WHEN** a user switches to Preview mode multiple times in one session
- **THEN** the WASM module is initialised only once and reused for subsequent renders

---

### Requirement: Manual refresh re-renders the preview
The system SHALL provide a way for the user to re-render the preview after making edits in Build mode.

#### Scenario: Refresh button re-renders
- **WHEN** a user returns to Build mode, makes edits, and switches back to Preview mode
- **THEN** a refresh control is available
- **WHEN** the user activates the refresh control
- **THEN** `render_preview` is called again with the updated blocks
- **THEN** the preview updates to reflect the current state
