## MODIFIED Requirements

### Requirement: Workspace brand rules
A workspace SHALL be able to define a single set of brand rules using the `StylesheetDef` structure: two global font tokens, two global colour tokens, and per-style sizing/spacing for all standard paragraph styles (normal, h1–h6, tableHeader, tableData). Brand rules are a workspace-level resource, not a per-user resource.

#### Scenario: Brand rules defined
- **WHEN** a workspace administrator defines brand rules
- **THEN** the rules SHALL be stored as a `StylesheetDef` and associated with the workspace

#### Scenario: New template seeded from brand rules
- **WHEN** a new template is created and brand rules exist
- **THEN** the template's initial stylesheet SHALL be a full copy of the current brand rules

#### Scenario: Brand rules change does not affect existing templates
- **WHEN** brand rules are updated
- **THEN** existing templates SHALL retain their current stylesheets unchanged

#### Scenario: No brand rules defined
- **WHEN** no brand rules have been set for the workspace
- **THEN** new templates SHALL be seeded with an empty `StylesheetDef` (all fields unset)

---

### Requirement: Brand rules content
Brand rules SHALL define the full typographic identity of the workspace using `StylesheetDef`: heading font, body font, heading colour, body colour, and per-style entries for font size, spacing before, spacing after (plus indent size for normal, line width and line colour for table styles). All measurements SHALL be in points (pt).

#### Scenario: Brand rules properties
- **WHEN** brand rules are saved
- **THEN** they SHALL be stored as a valid `StylesheetDef` with all submitted fields preserved

---

### Requirement: Brand rules management
Brand rules SHALL be manageable from the Stylesheets area of the app. The page SHALL display explanation copy describing how brand rules seed new templates, and SHALL present the full fixed style set (normal, h1–h6, tableHeader, tableData) in an accordion editor regardless of any template's content.

#### Scenario: Explanation copy shown
- **WHEN** a user navigates to the Stylesheets area
- **THEN** the page SHALL display: "Brand rules are your workspace defaults. New templates start with a complete copy of these settings. Changes here don't affect templates you've already created."

#### Scenario: Full style set always shown
- **WHEN** a user views the Stylesheets area
- **THEN** the accordion SHALL show all style entries (normal, h1–h6, tableHeader, tableData) regardless of any template content

#### Scenario: Brand rules editable
- **WHEN** a user navigates to the Stylesheets area
- **THEN** they SHALL be able to edit all fields in the stylesheet editor and save the result

#### Scenario: Brand rules saved
- **WHEN** a user saves updated brand rules
- **THEN** the new `StylesheetDef` SHALL be stored and used as the seed for subsequently created templates
