## ADDED Requirements

### Requirement: Document map panel
The right-hand panel SHALL include a Document Map tab showing the document's structural outline and intent annotations together. The map SHALL be updated in real time as the document is edited.

#### Scenario: Structure entries shown
- **WHEN** the Document Map tab is open
- **THEN** the panel SHALL list headings (H1, H2, H3) and paragraph blocks in document order, indented by heading level

#### Scenario: Intent annotations shown inline
- **WHEN** a section has a `conditionIntent` or `repeatIntent`
- **THEN** the map entry for that section SHALL display the intent icon and the first words of the intent label alongside the structural entry

#### Scenario: Field intents shown under their paragraph
- **WHEN** a paragraph contains one or more `fieldIntent` nodes
- **THEN** the map SHALL list each field intent as a child entry under the paragraph entry, showing the field label

#### Scenario: Map updates on edit
- **WHEN** the user edits the document (adds content, applies an intent, removes an intent)
- **THEN** the document map SHALL reflect the change without requiring a manual refresh

---

### Requirement: Document map navigation
Clicking any entry in the Document Map SHALL scroll the canvas to the corresponding location and place the cursor there.

#### Scenario: Click heading entry navigates to heading
- **WHEN** a user clicks a heading entry in the document map
- **THEN** the canvas SHALL scroll to bring that heading into view and focus the editor at that position

#### Scenario: Click intent entry navigates to annotated section
- **WHEN** a user clicks an intent entry in the document map
- **THEN** the canvas SHALL scroll to the annotated section and highlight it briefly to confirm the location

#### Scenario: Click field intent navigates to chip
- **WHEN** a user clicks a field intent entry in the document map
- **THEN** the canvas SHALL scroll to the paragraph containing the chip and select it
