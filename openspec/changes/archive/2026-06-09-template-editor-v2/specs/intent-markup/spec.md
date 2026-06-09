## MODIFIED Requirements

### Requirement: Field intent annotation
The system SHALL allow a user to select text within the editor and annotate it as a field intent via a unified selection-based gesture. The selected text SHALL be replaced by a `fieldIntent` inline node storing the label. The annotation SHALL be visually distinct from plain text.

#### Scenario: Text selection triggers intent popover
- **WHEN** a user selects inline text and activates the intent action (toolbar button or context menu)
- **THEN** a floating popover SHALL appear with Field, Conditional, and Repeat options; Conditional and Repeat SHALL be disabled for inline-only selections

#### Scenario: Field intent applied with label
- **WHEN** a user selects Field in the intent popover and enters a label
- **THEN** the selected text SHALL be replaced with a `fieldIntent` chip node carrying the label

#### Scenario: Field intent chip rendered
- **WHEN** a `fieldIntent` node exists in the document
- **THEN** the canvas SHALL render it as a styled inline chip in the accent colour showing the intent label

#### Scenario: Field intent label editable via chip click
- **WHEN** a user clicks a field intent chip
- **THEN** a popover SHALL appear allowing the label to be edited in place

#### Scenario: Field intent removable via popover
- **WHEN** a user clicks Remove in the field intent popover
- **THEN** the label text is restored as a plain text span and the chip is removed

#### Scenario: Field intent persisted in block model
- **WHEN** the template is saved after adding a field intent
- **THEN** the `fieldIntent` node SHALL be present in the block model JSONB in PostgreSQL

---

### Requirement: Condition intent annotation
The system SHALL allow a user to annotate a range of paragraphs as a conditional section via a unified selection-based gesture. The intent SHALL be stored as a `conditionIntent` string on the section's project block. The annotated section SHALL be visually marked in the canvas with a left-border stripe.

#### Scenario: Block-level selection triggers intent popover
- **WHEN** a user selects content spanning one or more paragraphs and activates the intent action
- **THEN** a floating popover SHALL appear with Field (disabled), Conditional, and Repeat options

#### Scenario: Condition intent applied to selection
- **WHEN** a user selects Conditional in the intent popover and enters a description
- **THEN** the selected paragraphs SHALL form a section with `conditionIntent` set to the description

#### Scenario: Condition intent stripe rendered
- **WHEN** a section has a `conditionIntent`
- **THEN** the canvas SHALL render a left-border stripe alongside the section with a ◈ icon and the intent label preview

#### Scenario: Condition intent editable via icon
- **WHEN** a user clicks the ◈ icon on a condition-annotated section
- **THEN** a popover SHALL show the full intent text with Edit and Remove actions

#### Scenario: Condition intent removable
- **WHEN** a user clicks Remove in the condition intent popover
- **THEN** the `conditionIntent` SHALL be cleared from the section and the stripe SHALL disappear

---

### Requirement: Repeat intent annotation
The system SHALL allow a user to annotate a range of paragraphs as a repeating section via a unified selection-based gesture. The intent SHALL be stored as a `repeatIntent` string on the section's project block. The annotated section SHALL be visually marked in the canvas with a left-border stripe.

#### Scenario: Repeat intent applied to selection
- **WHEN** a user selects content spanning one or more paragraphs and chooses Repeat from the intent popover with a description
- **THEN** the selected paragraphs SHALL form a section with `repeatIntent` set to the description

#### Scenario: Repeat intent stripe rendered
- **WHEN** a section has a `repeatIntent`
- **THEN** the canvas SHALL render a left-border stripe alongside the section with a ◈ icon and the intent label preview

#### Scenario: Intent types mutually exclusive per section
- **WHEN** a section already has a `conditionIntent` and a user tries to apply a `repeatIntent` to it (or vice versa)
- **THEN** the popover SHALL warn that an existing intent will be replaced and require confirmation

#### Scenario: Repeat intent persisted in block model
- **WHEN** the template is saved after adding a repeat intent
- **THEN** the `repeatIntent` SHALL be present in the block model JSONB in PostgreSQL
