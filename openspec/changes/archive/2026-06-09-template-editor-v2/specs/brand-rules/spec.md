## ADDED Requirements

### Requirement: Workspace brand rules
A workspace SHALL be able to define a single set of brand rules: typography and spacing defaults that serve as the starting point for new template stylesheets. Brand rules are a workspace-level resource, not a per-user resource.

#### Scenario: Brand rules defined
- **WHEN** a workspace administrator defines brand rules
- **THEN** the rules SHALL be stored and associated with the workspace

#### Scenario: New template seeded from brand rules
- **WHEN** a new template is created and brand rules exist
- **THEN** the template's initial stylesheet SHALL reflect the current brand rules

#### Scenario: Brand rules change does not affect existing templates
- **WHEN** brand rules are updated
- **THEN** existing templates SHALL retain their current stylesheets unchanged

#### Scenario: No brand rules defined
- **WHEN** no brand rules have been set for the workspace
- **THEN** new templates SHALL be seeded from system defaults

---

### Requirement: Brand rules content
Brand rules SHALL define the core typographic identity of the workspace: primary typeface, base text size, accent colour, and default spacing.

#### Scenario: Brand rules properties
- **WHEN** brand rules are saved
- **THEN** they SHALL include: primary font family, base font size, heading font (may be same as body), accent colour (hex), and default paragraph spacing

---

### Requirement: Brand rules management
Brand rules SHALL be manageable from the Stylesheets area of the app.

#### Scenario: Brand rules editable
- **WHEN** a user navigates to the Stylesheets area
- **THEN** they SHALL be able to view and edit the workspace's brand rules

#### Scenario: Brand rules saved
- **WHEN** a user saves updated brand rules
- **THEN** the new rules SHALL be stored and will be used as the seed for subsequently created templates
