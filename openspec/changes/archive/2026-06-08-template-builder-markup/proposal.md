## Why

Non-technical users already have their documents in Word or similar tools. Making them build a template from scratch on a blank canvas is the wrong starting point — their document IS their template; they just need to tell the system which parts are dynamic. This change introduces the document-first path: upload a DOCX, see it rendered on a canvas as editable blocks, then annotate it with natural language intent markers (field intents, condition intents, repeat intents). These markers are an interim representation — informal, human-authored — stored in the block model until a subsequent change (Journey A data upload + LLM bridge) resolves them into proper merge fields and condition trees.

## What Changes

- **DOCX import pipeline**: Office XML (w:p/w:r/w:rPr) → Portable Text → block model (Rust, `apps/api`)
- **Template storage**: `templates` table in PostgreSQL; block model stored as JSONB
- **Template CRUD API**: create, list, get, update, delete endpoints (`apps/api`)
- **Canvas**: React frontend rendering block model as editable blocks (Tiptap for text blocks)
- **Intent markup tools** (three annotation types):
  - **Field intent**: user selects text → names it in natural language ("customer's full name") → stored as a `fieldIntent` inline node in Portable Text
  - **Condition intent**: user selects a block → describes when it applies ("show only when invoice is paid") → stored as a `conditionIntent` on the block
  - **Repeat intent**: user selects a block → describes what it repeats over ("one row per line item") → stored as a `repeatIntent` on the block
- **From-scratch path**: blank canvas with block palette (Text, Divider to start) as secondary entry point
- **Workspace mode shell**: Build mode active; Preview and Data mode tabs present but disabled (enabled in subsequent changes)

## Capabilities

### New Capabilities

- `template-storage`: Template CRUD — create, list, open, save, delete; block model persisted in PostgreSQL as JSONB
- `document-import`: DOCX upload and parsing — Office XML to Portable Text to block model; displayed on canvas as editable blocks
- `intent-markup`: Three inline annotation tools for marking up a document with natural language field, condition, and repeat intents; intent markers stored in the block model

### Modified Capabilities

_(none)_

## Impact

- **Backend**: New `templates` table (migration); DOCX parsing in Rust; template CRUD endpoints; multipart upload handler
- **Frontend**: Tiptap integration; canvas block renderer; intent toolbar; block palette; template list view
- **Dependencies**: DOCX parsing library (Rust — `docx-rs` or direct `zip`/XML parsing); Tiptap npm packages
- **No compilation**: No Typst compilation in this change — intent markers are not yet resolvable to field paths
- **No LLM calls**: Intent labels are user-typed natural language, not LLM-generated

## Non-goals

- LLM mapping of intent labels to field paths (Journey A bridge — subsequent change)
- Schema inference from uploaded data (subsequent change)
- Typst compilation or PDF preview (subsequent change)
- Condition visual query builder (subsequent change)
- Repeating section empty-state slot (subsequent change)
- PDF or Markdown import (DOCX only for this change)
- Pin blocks (Header, Footer, etc.) — deferred

## Phase

Phase 1 — core template builder. Depends on: auth (complete), render pipeline (complete).
