## MODIFIED Requirements

### Requirement: Per-template stylesheet
Each template SHALL have its own stylesheet stored as a `StylesheetDef`. The stylesheet SHALL be seeded from the workspace's brand rules at template creation time (as a full copy) and thereafter be fully independent. The previous snapshot+overrides structure is replaced by a single `StylesheetDef` document.

#### Scenario: Template created with brand rules as starting point
- **WHEN** a new template is created and brand rules exist for the workspace
- **THEN** the template's stylesheet SHALL be initialised as a full copy of the current brand rules `StylesheetDef`

#### Scenario: Template created without brand rules
- **WHEN** a new template is created and no brand rules have been defined
- **THEN** the template's stylesheet SHALL be initialised as an empty `StylesheetDef` (all fields unset)

#### Scenario: Stylesheet change does not affect other templates
- **WHEN** a user modifies the stylesheet of one template
- **THEN** no other templates SHALL be affected

---

### Requirement: Stylesheet content
A stylesheet SHALL be a valid `StylesheetDef` containing up to two global font tokens, two global colour tokens, and per-style entries for any subset of the standard styles (normal, h1–h6, tableHeader, tableData). All numeric measurements SHALL be in points (pt).

#### Scenario: Stylesheet stored as StylesheetDef
- **WHEN** a stylesheet is saved via `PUT /templates/:id`
- **THEN** the `stylesheet` JSONB column SHALL contain the submitted `StylesheetDef`

---

### Requirement: Stylesheet editor in template right panel
The Styles tab in the template editor's right-hand panel SHALL allow the user to view and directly edit the template's stylesheet using the stylesheet editor component. Changes SHALL be auto-saved with a 2-second debounce. The accordion SHALL show only the style entries present in the template's current block model; entries absent from the block model SHALL be hidden.

#### Scenario: Dynamic style visibility — headings
- **WHEN** the Styles tab is open and the template contains H1 and H2 blocks but no H3–H6
- **THEN** the Heading styles accordion SHALL show entries for H1 and H2 only

#### Scenario: Dynamic style visibility — tables
- **WHEN** the Styles tab is open and the template contains no table blocks
- **THEN** the Table styles accordion section SHALL not be shown

#### Scenario: Dynamic style visibility — table headers
- **WHEN** the Styles tab is open and the template contains a table with no header cells
- **THEN** the tableHeader entry SHALL not be shown within the Table styles section

#### Scenario: Text styles always shown
- **WHEN** the Styles tab is open
- **THEN** the Text styles section (normal) SHALL always be shown regardless of block model content

#### Scenario: Accordion updates when block model changes
- **WHEN** the user adds an H3 heading to the template canvas
- **THEN** an H3 entry SHALL appear in the Heading styles accordion without requiring a page reload

#### Scenario: Auto-save on change
- **WHEN** a user changes any field in the Styles tab
- **THEN** the change SHALL be auto-saved to the template via `PUT /templates/:id` after a 2-second debounce

## REMOVED Requirements

### Requirement: Stylesheet editor in right panel (read-only)
**Reason**: Replaced by the editable Styles tab with auto-save. The previous read-only display and "Edit brand rules →" link are removed.
**Migration**: The `StylesheetTab` component is rewritten as an editable accordion; no user action required.
