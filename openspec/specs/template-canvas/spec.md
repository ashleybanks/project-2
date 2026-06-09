## Purpose

Defines the single-editor continuous document canvas, the PT-extended block model with section types, intent markup interactions, and the formatting toolbar.

## Requirements

### Requirement: Single-editor document canvas
The template editor SHALL use a single Tiptap editor instance for the full document content. Project block boundaries SHALL be represented as structural section nodes within the ProseMirror schema, not as separate editor instances. The canvas SHALL render the complete document as a continuous, flowing editing surface.

#### Scenario: Document loads as continuous canvas
- **WHEN** a template is opened in the editor
- **THEN** all text content SHALL render as a single continuous editing surface with no visible per-block editor boundaries

#### Scenario: Section node separates project blocks
- **WHEN** the document contains multiple project blocks
- **THEN** each project block SHALL be represented as a section node in the ProseMirror schema, visually separated but editable in the same surface

#### Scenario: Empty canvas starts with one section
- **WHEN** a blank template is opened
- **THEN** the canvas SHALL contain one empty section node ready for typing

---

### Requirement: PT-extended block model with section type
The block model SHALL be a PT array. Intent-annotated ranges SHALL be represented as `_type: "section"` custom PT objects. Plain content SHALL be standard `_type: "block"` PT entries at the top level. There is no separate "project block" concept — sections are first-class PT.

#### Scenario: Multi-paragraph section in block model
- **WHEN** a section contains a heading followed by two body paragraphs and carries a repeat intent
- **THEN** the block model entry SHALL be `{ "_type": "section", "_key": "...", "repeatIntent": "...", "content": [PT-h1, PT-p, PT-p] }`

#### Scenario: Plain content as top-level PT blocks
- **WHEN** paragraphs carry no intent annotation
- **THEN** they SHALL be stored as standard `{ "_type": "block", ... }` entries directly in the top-level blocks array, not wrapped in a section

#### Scenario: Section split at intent boundary
- **WHEN** a user applies a repeat intent to a range of paragraphs that includes some plain top-level PT blocks
- **THEN** those PT blocks SHALL be wrapped in a new `_type: "section"` entry with `repeatIntent` set; surrounding plain content remains as top-level PT blocks

#### Scenario: Adjacent plain sections merge on intent removal
- **WHEN** a user removes the intent from a section that is adjacent to plain top-level PT blocks
- **THEN** the system SHALL offer to unwrap the section (moving its content back to top-level PT blocks), or leave it as a plain section

---

### Requirement: Intent markup via text selection
The system SHALL allow users to apply intent annotations by selecting content in the editor and activating an intent action. A single unified gesture SHALL apply to all three intent types: field (inline), condition (block-level), and repeat (block-level).

#### Scenario: Inline selection opens intent menu
- **WHEN** a user selects text within a single paragraph and activates the intent action (toolbar button or right-click)
- **THEN** a floating popover SHALL appear offering Field, Conditional, and Repeat options

#### Scenario: Block-level selection opens intent menu
- **WHEN** a user selects content spanning one or more paragraphs and activates the intent action
- **THEN** a floating popover SHALL appear offering Field, Conditional, and Repeat options (Field disabled if selection spans multiple paragraphs)

#### Scenario: Field intent applied to selection
- **WHEN** a user selects inline text and chooses Field from the intent popover
- **THEN** the selected text SHALL be replaced with a `fieldIntent` inline chip node carrying the label, and a popover SHALL prompt for the intent label

#### Scenario: Condition intent applied to selection
- **WHEN** a user selects a range of paragraphs and chooses Conditional from the intent popover
- **THEN** the selected paragraphs SHALL become a section with a `conditionIntent` string, and the popover SHALL prompt for the intent description

#### Scenario: Repeat intent applied to selection
- **WHEN** a user selects a range of paragraphs and chooses Repeat from the intent popover
- **THEN** the selected paragraphs SHALL become a section with a `repeatIntent` string, and the popover SHALL prompt for the intent description

---

### Requirement: Visual intent annotations
Applied intents SHALL be visually annotated in the canvas. All intent types SHALL use a single accent colour. Field intents render as inline chips. Block-level intents (condition, repeat) render as a left-border stripe with an icon and label. The annotation SHALL not disrupt text flow.

#### Scenario: Field intent chip rendered
- **WHEN** a `fieldIntent` node exists in the document
- **THEN** the canvas SHALL render it as a styled inline chip showing the intent label in the accent colour

#### Scenario: Block intent stripe rendered
- **WHEN** a section has a `conditionIntent` or `repeatIntent`
- **THEN** the canvas SHALL render a left-border stripe alongside the section content, with a small icon (◈) and the first few words of the intent label

#### Scenario: Intent popover on icon click
- **WHEN** a user clicks the intent icon (◈) on a block-level annotated section
- **THEN** a floating popover SHALL appear showing the full intent text with an edit action and a remove action

#### Scenario: Intent removed via popover
- **WHEN** a user clicks Remove in the intent popover
- **THEN** the intent SHALL be cleared from the section and the stripe SHALL disappear; the section content remains intact

---

### Requirement: Formatting toolbar
The editor SHALL provide a persistent toolbar above the canvas with standard rich-text formatting actions and an intent markup action.

#### Scenario: Text formatting applied
- **WHEN** a user selects text and clicks Bold, Italic, Underline, or a heading level in the toolbar
- **THEN** the selected text SHALL receive the corresponding mark or the paragraph style SHALL change

#### Scenario: Intent action in toolbar
- **WHEN** a user selects content and clicks the intent action in the toolbar
- **THEN** the intent popover SHALL appear, identical to the context-menu path
