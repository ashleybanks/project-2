## MODIFIED Requirements

### Requirement: DOCX upload and parsing
The system SHALL accept a DOCX file upload and parse it into a block model containing Portable Text blocks with static content. The import endpoint SHALL be stateless — it returns the block model without persisting it. The parsed output SHALL be a single project block containing an array of all PT elements from the document, rather than one project block per paragraph.

#### Scenario: Valid DOCX parses to single project block
- **WHEN** an authenticated user uploads a valid DOCX file to `POST /api/templates/import`
- **THEN** the system SHALL return a block model JSON with a single project block whose `content` array contains one PT element per DOCX paragraph, preserving text content and basic formatting marks (bold, italic)

#### Scenario: Headings preserved as PT block styles
- **WHEN** a DOCX paragraph uses a Heading style (Heading 1, Heading 2, Heading 3)
- **THEN** the corresponding PT element in the content array SHALL have `style: "h1"`, `style: "h2"`, or `style: "h3"` respectively

#### Scenario: Bold and italic runs preserved
- **WHEN** a DOCX run has bold (`w:b`) or italic (`w:i`) formatting
- **THEN** the corresponding PtSpan SHALL carry `"strong"` or `"em"` marks respectively

#### Scenario: Tables degrade gracefully
- **WHEN** a DOCX file contains a table
- **THEN** each table cell's content SHALL be extracted as flat PT elements appended to the single project block's content array; no table structure is preserved in this version

#### Scenario: Oversized file rejected
- **WHEN** a DOCX file exceeding 10MB is uploaded
- **THEN** the system SHALL return HTTP 413 with a clear error message

#### Scenario: Non-DOCX file rejected
- **WHEN** a file that is not a valid DOCX (e.g. a PDF or plain text file renamed to .docx) is uploaded
- **THEN** the system SHALL return HTTP 422 with an error indicating the file could not be parsed

## MODIFIED Requirements

### Requirement: Canvas rendering of imported document
The frontend SHALL render a parsed block model as a single continuous editing surface. The entire document SHALL be editable within one Tiptap editor instance.

#### Scenario: Imported document renders as continuous canvas
- **WHEN** a block model is loaded into the canvas
- **THEN** all PT content SHALL render as a continuous document in the single editor, with headings and paragraphs flowing naturally

#### Scenario: Heading style rendered distinctly
- **WHEN** a PT element has style `h1`, `h2`, or `h3`
- **THEN** the content SHALL render with the corresponding heading visual treatment within the continuous canvas

#### Scenario: Bold and italic rendered correctly
- **WHEN** a PtSpan has `"strong"` or `"em"` marks
- **THEN** the text SHALL render bold or italic respectively in the editor
