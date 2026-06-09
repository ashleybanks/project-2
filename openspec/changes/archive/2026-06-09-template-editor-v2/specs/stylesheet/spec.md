## ADDED Requirements

### Requirement: Per-template stylesheet
Each template SHALL have its own stylesheet defining document-level and paragraph-level style rules. The stylesheet SHALL be seeded from the workspace's brand rules at template creation time and thereafter be fully independent. The stylesheet SHALL be stored as a brand rules snapshot plus an optional set of local overrides.

#### Scenario: Template created with brand rules as starting point
- **WHEN** a new template is created and brand rules exist for the workspace
- **THEN** the template's stylesheet SHALL be initialised with a snapshot of the current brand rules, with no local overrides

#### Scenario: Template created without brand rules
- **WHEN** a new template is created and no brand rules have been defined
- **THEN** the template's stylesheet SHALL be initialised from system defaults

#### Scenario: Stylesheet change does not affect other templates
- **WHEN** a user modifies the stylesheet of one template
- **THEN** no other templates SHALL be affected

---

### Requirement: Stylesheet content
A stylesheet SHALL define document-level properties and named paragraph styles.

#### Scenario: Document-level properties
- **WHEN** a stylesheet is defined
- **THEN** it SHALL include document-level properties: page size, margins, and default body font (family, size, line height)

#### Scenario: Named paragraph styles
- **WHEN** a stylesheet is defined
- **THEN** it SHALL include named paragraph styles (e.g. `heading-1`, `heading-2`, `body`, `caption`) each specifying font family, size, weight, colour, and spacing

#### Scenario: Style applied to block
- **WHEN** a project block references a named style
- **THEN** the compiled output SHALL apply that style's properties to the block's content

---

### Requirement: Stylesheet editor in right panel
The Stylesheet tab in the template editor's right-hand panel SHALL allow the user to view the current stylesheet and select a different one from the workspace's stylesheet library. Full stylesheet editing SHALL be done in the dedicated Stylesheets area of the app, not in this panel.

#### Scenario: Current stylesheet shown in panel
- **WHEN** a user opens the Stylesheet tab
- **THEN** the panel SHALL show the name of the currently applied stylesheet and a summary of its key properties

#### Scenario: Stylesheet selection
- **WHEN** a user selects a different stylesheet from the dropdown in the Stylesheet tab
- **THEN** the template's stylesheet SHALL be updated to the selected one (seeded from that stylesheet's current state)

#### Scenario: Link to stylesheet editor
- **WHEN** a user wants to edit stylesheet properties
- **THEN** the panel SHALL provide a link to open the full stylesheet editor in the Stylesheets area
