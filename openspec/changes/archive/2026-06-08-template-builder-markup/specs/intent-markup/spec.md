## ADDED Requirements

### Requirement: Field intent annotation
The system SHALL allow a user to select text within a text block and annotate it as a field intent — a natural language label indicating that this text should become a merge field. The selected text SHALL be replaced by a `fieldIntent` inline node storing the label. The annotation SHALL be visually distinct from plain text in the editor.

#### Scenario: Text selection converted to field intent
- **WHEN** a user selects text in a text block and activates "Mark as field" with a label ("customer's full name")
- **THEN** the selected text is replaced by a `fieldIntent` node `{ "_type": "fieldIntent", "label": "customer's full name" }` in the Portable Text document

#### Scenario: Field intent rendered as chip
- **WHEN** a `fieldIntent` node exists in a text block's content
- **THEN** the canvas SHALL render it as a styled inline chip displaying the label text, visually distinct from surrounding text

#### Scenario: Field intent label editable
- **WHEN** a user clicks a field intent chip
- **THEN** the label SHALL be editable in place (or via a popover) without converting the node back to plain text

#### Scenario: Field intent removable
- **WHEN** a user removes a field intent chip
- **THEN** the label text is restored as a plain text span in the Portable Text document

#### Scenario: Field intent persisted in block model
- **WHEN** the template is saved after adding a field intent
- **THEN** the `fieldIntent` node SHALL be present in the block model JSONB in PostgreSQL

---

### Requirement: Condition intent annotation
The system SHALL allow a user to annotate a block with a natural language condition intent — a description of when the block should appear. The intent SHALL be stored as a `conditionIntent` string property on the block. A block with a condition intent SHALL be visually marked in the canvas.

#### Scenario: Condition intent added to block
- **WHEN** a user selects a block and activates "Make conditional" with a description ("show only when the invoice has been paid")
- **THEN** the block model entry for that block SHALL include `"conditionIntent": "show only when the invoice has been paid"`

#### Scenario: Condition intent displayed on block
- **WHEN** a block has a `conditionIntent` property
- **THEN** the canvas SHALL display a visible badge or banner on the block showing the intent text

#### Scenario: Condition intent editable
- **WHEN** a user edits the condition intent on a block
- **THEN** the updated description SHALL replace the previous value in the block model

#### Scenario: Condition intent removable
- **WHEN** a user removes a condition intent from a block
- **THEN** the `conditionIntent` property SHALL be absent from the block model entry

---

### Requirement: Repeat intent annotation
The system SHALL allow a user to annotate a block with a natural language repeat intent — a description of what the block iterates over. The intent SHALL be stored as a `repeatIntent` string property on the block. A block with a repeat intent SHALL be visually marked in the canvas.

#### Scenario: Repeat intent added to block
- **WHEN** a user selects a block and activates "Make repeating" with a description ("one row per line item on the invoice")
- **THEN** the block model entry for that block SHALL include `"repeatIntent": "one row per line item on the invoice"`

#### Scenario: Repeat intent displayed on block
- **WHEN** a block has a `repeatIntent` property
- **THEN** the canvas SHALL display a visible badge or banner on the block showing the intent text

#### Scenario: Repeat intent mutually exclusive with condition intent
- **WHEN** a user attempts to add a repeat intent to a block that already has a condition intent (or vice versa)
- **THEN** the system SHALL display a warning and require the user to remove the existing intent before adding the new one

#### Scenario: Repeat intent persisted in block model
- **WHEN** the template is saved after adding a repeat intent
- **THEN** the `repeatIntent` property SHALL be present in the block model JSONB in PostgreSQL
