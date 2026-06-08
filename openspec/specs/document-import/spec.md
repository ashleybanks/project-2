## ADDED Requirements

### Requirement: DOCX upload and parsing
The system SHALL accept a DOCX file upload and parse it into a block model containing Portable Text blocks with static content. The import endpoint SHALL be stateless — it returns the block model without persisting it.

#### Scenario: Valid DOCX parses to block model
- **WHEN** an authenticated user uploads a valid DOCX file to `POST /api/templates/import`
- **THEN** the system SHALL return a block model JSON with one block per DOCX paragraph, preserving text content and basic formatting marks (bold, italic)

#### Scenario: Headings preserved as block styles
- **WHEN** a DOCX paragraph uses a Heading style (Heading 1, Heading 2, Heading 3)
- **THEN** the corresponding PtBlock SHALL have `style: "h1"`, `style: "h2"`, or `style: "h3"` respectively

#### Scenario: Bold and italic runs preserved
- **WHEN** a DOCX run has bold (`w:b`) or italic (`w:i`) formatting
- **THEN** the corresponding PtSpan SHALL carry `"strong"` or `"em"` marks respectively

#### Scenario: Tables degrade gracefully
- **WHEN** a DOCX file contains a table
- **THEN** each table cell's content SHALL be extracted as flat text blocks (one block per cell paragraph); no table structure is preserved in this version

#### Scenario: Oversized file rejected
- **WHEN** a DOCX file exceeding 10MB is uploaded
- **THEN** the system SHALL return HTTP 413 with a clear error message

#### Scenario: Non-DOCX file rejected
- **WHEN** a file that is not a valid DOCX (e.g. a PDF or plain text file renamed to .docx) is uploaded
- **THEN** the system SHALL return HTTP 422 with an error indicating the file could not be parsed

---

### Requirement: Canvas rendering of imported document
The frontend SHALL render a parsed block model as an editable canvas. Each block SHALL be displayed as an independent editable unit. Text blocks SHALL use Tiptap for rich text editing.

#### Scenario: Text block rendered as Tiptap editor
- **WHEN** a block model with text blocks is loaded into the canvas
- **THEN** each text block SHALL render as a Tiptap editor instance showing the block's Portable Text content

#### Scenario: Heading style rendered distinctly
- **WHEN** a PtBlock has style `h1`, `h2`, or `h3`
- **THEN** the block SHALL render with the corresponding heading visual treatment

#### Scenario: Bold and italic rendered correctly
- **WHEN** a PtSpan has `"strong"` or `"em"` marks
- **THEN** the text SHALL render bold or italic respectively in the Tiptap editor
