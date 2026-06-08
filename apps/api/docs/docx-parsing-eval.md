# DOCX Parsing Library Evaluation

**Date:** 2026-06-08

## Candidates

### `docx-rs` v0.4.20
- Description: "A .docx file writer with Rust/WebAssembly"
- **Primary use case: writing DOCX, not reading**
- Reading functionality exists but is not the design focus
- Verdict: **Rejected** — wrong tool for the job

### `zip` + `quick-xml` (direct)
- `zip`: unpack DOCX archive, read `word/document.xml`
- `quick-xml`: SAX-style streaming XML parser, already in dependency tree via typst
- Complete control over which elements we handle vs. skip
- No abstraction layer to fight when the OOXML elements we need don't match the library's model
- Verdict: **Selected**

## Decision: direct `zip` + `quick-xml`

Implementing against the explicit mapping table in design.md:
- Supported elements handled precisely
- Unsupported elements skipped gracefully
- No hidden magic, no version coupling to a third-party DOCX model
