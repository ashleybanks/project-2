## Context

Two prerequisite spikes are complete: auth (argon2 + server-side sessions) and the Typst render pipeline (block model → Typst → PDF, Wasm-compatible). The template builder is the first user-facing feature — the canvas where templates are created and marked up.

The primary user journey is document-first: upload an existing DOCX, see it on the canvas, annotate with intent markers. From-scratch is a supported secondary path. Neither path produces a compilable template yet — compilation requires the LLM bridge (Journey A, subsequent change) to resolve intent markers into proper field paths.

The key design tension is between the **interim nature of intent markers** (natural language, not machine-executable) and the **permanent nature of the block model** (the canonical representation that everything else is built on). Intent markers need to be first-class citizens in the block model, not a workaround.

## Goals / Non-Goals

**Goals:**
- DOCX upload → Portable Text → block model → canvas render, end-to-end
- Three intent annotation tools: field intent (inline), condition intent (block-level), repeat intent (block-level)
- Intent markers stored durably in the block model JSONB in PostgreSQL
- Template CRUD (create from DOCX, create blank, list, open, save, delete)
- Tiptap rich text editing for text blocks (bold, italic, headings — no merge fields yet)
- From-scratch path: blank canvas with minimal block palette (Text, Divider)
- Workspace mode shell with Build / Preview / Data tabs (Preview and Data disabled)

**Non-Goals:**
- LLM calls of any kind
- Typst compilation or PDF preview
- Schema inference or data upload
- Condition visual builder or condition tree
- Pin blocks (Header, Footer, Page Number)
- PDF or Markdown import
- Drag-to-reorder blocks (deferred — complex DnD with Tiptap interactions)

## Decisions

### 1. Intent markers as Portable Text node types

Intent markers live inside the block model, not alongside it. This keeps the block model as the single source of truth.

**Field intent** — an inline Portable Text node replacing selected text:
```json
{ "_type": "fieldIntent", "_key": "fi1", "label": "customer's full name" }
```
Rendered as a styled chip in Tiptap (custom node extension). Visually distinct from plain text. Replaces the selected text — the original text becomes the label.

**Condition intent** — a property on a Block (not inline):
```json
{
  "type": "text",
  "conditionIntent": "show only when the invoice has been paid",
  "content": [...]
}
```
Displayed as a banner/badge on the block in the canvas. Does not affect content rendering.

**Repeat intent** — a property on a Block:
```json
{
  "type": "text",
  "repeatIntent": "one row per line item on the invoice",
  "content": [...]
}
```
Same display treatment as condition intent — a badge on the block.

**Why not a separate annotations table:** Keeping intents in the block model means a single save operation, a single source of truth, and no join queries. When the LLM bridge resolves intents, it updates the block model in place.

### 2. DOCX parsing strategy: direct XML over Pandoc

DOCX files are ZIP archives containing `word/document.xml`. Pandoc introduces markdown as an intermediate which loses structural detail and requires an extra binary dependency. Direct XML parsing with `quick-xml` (already in the Typst dependency tree) gives precise control with no extra binary.

The OOXML spec (ECMA-376) is enormous. We do not attempt full coverage. Instead we define an explicit supported subset and a clear policy for everything else. This is the success criterion for the parser — not spec completeness, but correct handling of this subset and graceful degradation of everything outside it.

**Supported — map to Portable Text:**

| DOCX element | Portable Text output | Notes |
|---|---|---|
| `w:p` | `PtBlock` | One block per paragraph |
| `w:r` + `w:t` | `PtSpan` (text content) | Text runs become spans |
| `w:rPr` + `w:b` | `"strong"` mark | Bold |
| `w:rPr` + `w:i` | `"em"` mark | Italic |
| `w:rPr` + `w:u` | `"underline"` mark | Underline |
| `w:rPr` + `w:strike` | `"strike"` mark | Strikethrough |
| `w:pStyle "Heading1"` | `style: "h1"` | |
| `w:pStyle "Heading2"` | `style: "h2"` | |
| `w:pStyle "Heading3"` | `style: "h3"` | |
| `w:pStyle` (any other) | `style: "normal"` | Style name discarded |
| `w:br` (line break) | `\n` within span | Not a paragraph break |
| `w:tbl` / `w:tr` / `w:tc` | Flat text blocks per cell | Table structure lost; noted in UI |
| `w:numPr` (list item) | Plain `PtBlock` | Bullet/number as leading text span |

**Skip — extract text if possible, discard structure silently:**

| DOCX element | Behaviour |
|---|---|
| `w:drawing` / `w:pict` (image) | Insert a placeholder `PtBlock` with text `[Image]` |
| `w:hyperlink` | Extract inner text as plain span; URL discarded |
| `w:fldChar` / `w:instrText` (fields) | Discard entirely |
| `w:ins` (tracked insertion) | Include text (treat as accepted) |
| `w:del` (tracked deletion) | Discard text (treat as accepted) |
| `w:footnote` / `w:endnote` | Discard |
| `w:comment` | Discard |

**Skip entirely — not body content:**

| Source | Behaviour |
|---|---|
| `word/header*.xml`, `word/footer*.xml` | Ignored (pin blocks, deferred) |
| `word/styles.xml` | Consulted only for `w:pStyle` name lookup |
| `word/theme/`, settings, relationships | Ignored |
| `word/footnotes.xml`, `word/endnotes.xml` | Ignored |

**Revisit triggers:** This mapping will need expanding as real user documents reveal gaps — particularly list formatting (nested lists, custom bullets), colours and font sizes as stylesheet hints, and table structure once the Table block type is introduced. Each gap should be captured as a follow-on change rather than expanding scope here.

**Library evaluation criterion (task 2.1):** Does the chosen library provide reliable, ergonomic access to the XML elements in the "Supported" table above? Both `quick-xml` (streaming SAX-style) and `docx-rs` (document model) almost certainly do — the decision is ergonomics, maintenance activity, and whether `docx-rs` meaningfully reduces boilerplate for our specific mapping vs. adding an unnecessary abstraction.

### 3. Tiptap as the canvas editor

Tiptap is the rich text editor for text blocks. It natively produces ProseMirror JSON; we maintain a bidirectional bridge to/from Portable Text at load/save time.

Custom Tiptap node extensions:
- `FieldIntentNode` — renders as a coloured chip with the label text; non-editable inline
- `FieldIntentMark` or menu action — toolbar button "Mark as field" on text selection

The canvas is not a single Tiptap instance for the whole document. Each text block gets its own Tiptap editor instance. This keeps block boundaries clean and avoids complex cursor-across-block behaviour.

### 4. Block model → ProseMirror bridge at editor boundary

```
PostgreSQL (JSONB)          →   load   →   ProseMirror JSON   →   Tiptap editor
Tiptap editor (save event)  →   save   →   Portable Text      →   PostgreSQL (JSONB)
```

The bridge is a pair of pure functions:
- `ptToProsemirror(ptDoc: PtBlock[]) → ProsemirrorDoc`
- `prosemirrorToPt(pmDoc: ProsemirrorDoc) → PtBlock[]`

These live in `apps/web/src/lib/pt-bridge.ts`. `fieldIntent` nodes map 1:1 in both directions.

### 5. Template storage schema

```sql
CREATE TABLE templates (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT        NOT NULL,
    block_model JSONB       NOT NULL DEFAULT '{"blocks":[]}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX templates_user_id_idx ON templates(user_id);
CREATE INDEX templates_block_model_gin ON templates USING GIN(block_model);
```

The `block_model` column stores the full block model including intent markers. No separate compilation column yet — that's added when the LLM bridge lands.

### 6. API surface

```
POST   /api/templates                    Create (blank or from DOCX upload)
GET    /api/templates                    List (authenticated user's templates)
GET    /api/templates/:id                Get (full block model)
PUT    /api/templates/:id                Update (save block model)
DELETE /api/templates/:id                Delete
POST   /api/templates/import            DOCX upload → block model (returns unsaved template)
```

`POST /api/templates/import` accepts `multipart/form-data`, parses the DOCX, returns the block model JSON. The client previews it before creating the template. Creation is a separate `POST /api/templates` call — the import endpoint is stateless.

All template endpoints require authentication (session middleware applied).

## Risks / Trade-offs

**[Risk] DOCX parsing quality varies by document complexity** → Mitigation: handle the common case well (paragraphs, headings, basic formatting). Tables, images, and nested structures degrade gracefully to flat text blocks rather than failing. Document the known limitations clearly.

**[Risk] Tiptap per-block editor approach is unusual** → Mitigation: well-established pattern for block-based editors (Notion uses a similar architecture). Main concern is focus/keyboard navigation between blocks — implement basic up/down arrow key handling at the canvas level.

**[Risk] ProseMirror ↔ Portable Text bridge has edge cases** → Mitigation: the bridge is unit-tested exhaustively. Unknown PT node types fail loudly (established in the Typst spike). Unknown ProseMirror nodes fall back to plain text spans.

**[Trade-off] Intent markers are opaque to the compiler in Final mode** → By design. Until the LLM bridge runs, the block model cannot be compiled in Final mode. However, Preview mode (see Decision 7) can render a meaningful skeleton at any stage. The template list UI should indicate "markup in progress" vs "ready to compile" state, where "ready" means all intents are resolved.

**[Trade-off] No drag-to-reorder** → Blocks can be moved up/down via toolbar buttons (simpler than DnD). DnD with per-block Tiptap instances is a known complexity — deferred.

### 7. Compile modes — Preview and Final

The `typst-compiler` crate (built in the render spike) needs two compile modes. This design decision is captured here because it shapes the Wasm browser integration that follows this change, and must be designed in before the compiler is extended.

```rust
pub enum CompileMode {
    /// Intents become visible placeholders. Fields use .at() with a
    /// "[Missing: field]" default. Renders at any stage of the workflow.
    Preview,
    /// Intents are rejected (block model must be fully resolved before Final
    /// compile). Fields still use .at() defaults so a missing field in a
    /// production payload produces a marked gap rather than a crash.
    Final,
}
```

**Preview mode — skeleton compilation**

Intent markers are transformed to styled placeholder text before Typst compilation. The skeleton is valid Typst — the same Wasm renderer handles it identically to a fully-resolved template.

| Intent node | Preview output |
|---|---|
| `fieldIntent { label: "customer's full name" }` | `[customer's full name]` (italicised, greyed) |
| Block with `conditionIntent` | Block rendered unconditionally + a "?" badge in the margin |
| Block with `repeatIntent` | Block rendered once + a "×N" badge in the margin |
| Resolved `mergeField { field: "invoice.total" }` | `#data.invoice.at("total", default: "[Missing: invoice.total]")` |

This makes Preview mode useful at every stage of the workflow — during markup (see the document structure and layout), after the LLM bridge (see the document with real or generated test data), and for batch paging (page through 10 records, missing fields visually indicated without a render failure).

**Missing field handling — `.at()` with defaults**

All field references in compiled Typst use `.at("key", default: "...")` rather than direct member access. This applies in both Preview and Final mode:

```typst
// Instead of: #data.invoice.total  (crashes if field missing)
// Use: 
#data.invoice.at("total", default: "[Missing: invoice.total]")
```

In a batch preview of 10 records, a record with a missing field renders a clearly marked gap. The render does not fail. Missing fields are surfaced as a separate validation report alongside the preview, not as a blocker to rendering.

Nested access uses chained `.at()`:
```typst
#data.at("invoice", default: (:)).at("total", default: "[Missing: invoice.total]")
```

The compiler generates this form from the dot-path field reference (`invoice.total`) at compile time.

**Timing: Wasm browser integration**

The Wasm binary built in the render spike compiles successfully but is not yet wired into the browser. Wasm browser integration (wasm-bindgen, JS glue, React preview component) should be the change immediately after this one — not deferred to Phase 4. The batch paged preview use case (10 records, missing field indicators) depends on it and is part of the core merge workflow, not a B2B embellishment.

## Open Questions

1. **DOCX parsing library**: `quick-xml` for direct parsing, or is there a higher-level `docx-rs` crate worth evaluating? Check for active maintenance and DOCX coverage before committing.
2. **File size limit for DOCX upload**: What's a reasonable limit? 10MB covers most business documents.
3. **Multi-block repeat intent**: Can a repeat intent span multiple consecutive blocks (e.g., mark a heading and its following paragraph as a group that repeats)? Initial implementation: single block only. Group repeat is deferred.
4. **Margin badge rendering for intent indicators in preview**: How are "?" and "×N" badges rendered in the Typst PDF output? Options: Typst margin notes, floating positioned boxes, or inline text markers. Decide when implementing the Preview compile mode.
