## MODIFIED Requirements

### Requirement: Workspace tabs are Design, Data, and Preview
The template workspace SHALL have three top-level tabs: Design, Data, and Preview, in that order. The existing Build/Preview/Data tabs and their toggle control are replaced. The Design tab SHALL have two sub-tabs: Template and Schema.

- **Design → Template**: the Tiptap single-editor canvas and right-hand panel (Document Map, Styles, History); this is the existing Build mode, renamed
- **Design → Schema**: schema upload, intent mapping table, test data generation; this is the existing Data tab content, moved
- **Data**: job management surface (see `job-management` spec)
- **Preview**: WASM SVG render with record navigation (see `preview-record-navigation` and `svg-preview` specs)

#### Scenario: Design tab is the default on template open
- **WHEN** a user opens a template
- **THEN** the Design tab is active, with the Template sub-tab selected
- **THEN** the Tiptap editor and right-hand panel are visible

#### Scenario: Schema sub-tab shows data setup surfaces
- **WHEN** a user selects Design → Schema
- **THEN** the schema upload control, intent mappings table, and test data section are shown
- **THEN** the Tiptap editor and right-hand panel are hidden

#### Scenario: Switching to Data or Preview auto-collapses right panel
- **WHEN** a user switches from Design to Data or Preview
- **THEN** the right-hand panel collapses (existing behaviour, preserved)
- **WHEN** a user returns to Design
- **THEN** the right-hand panel restores to its previous collapsed/expanded state

---

## REMOVED Requirements

### Requirement: Mode switcher in template header (Build/Preview/Data)
**Reason:** Replaced by Design/Data/Preview tab navigation with Schema sub-tab under Design.
**Migration:** The three-button toggle in the header is removed. The new tab structure provides equivalent navigation with clearer separation of concerns.
