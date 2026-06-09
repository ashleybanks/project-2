## Why

The first template builder shipped a per-paragraph block model and a block-by-block editing UI. Loading a real DOCX revealed two structural problems: the block granularity is wrong (one project block per paragraph conflates content structure with template logic), and the editing experience is disconnected from how document editors feel — no toolbar, no contextual intent markup, no document navigation. This change rebuilds the editor on the right foundations before the LLM bridge step is added.

## What Changes

- **Block model restructure**: a project block becomes a *section* (one or more PT elements sharing the same template intent), not a wrapper around a single paragraph. DOCX import produces a flat document in one or a few project blocks, not one per paragraph.
- **Single Tiptap editor**: the canvas moves from per-block Tiptap instances to a single editor for the full document content, with project block boundaries represented as structural nodes.
- **Intent markup via selection**: users select text (inline) or a range of paragraphs (block-level) and apply an intent via a floating toolbar or context menu — no more separate block-level toolbars or prompt dialogs.
- **Intent annotations**: applied intents shown as visual annotations — inline chips for field intents, left-border stripe with an icon for condition/repeat intents. Single colour. Clicking the icon opens a floating popover for the intent's plain-text statement.
- **Right-hand panel**: three tabs — Document Map (structure + intents, clickable navigation), Stylesheet (per-template stylesheet seeded from brand rules), History (named version checkpoints with auto-save timeline).
- **Brand rules**: a workspace-level set of typography/spacing defaults that seed new template stylesheets. Templates diverge independently after creation — changing brand rules does not affect existing templates.
- **Stylesheet management**: a Stylesheets section in app navigation for creating, editing, and managing stylesheets. The Stylesheet tab in the editor selects and previews; full editing happens in the dedicated area.

## Capabilities

### New Capabilities

- `template-canvas`: Single-editor canvas with section-level project blocks, intent markup via selection, and visual intent annotations.
- `document-map`: Right-panel tab showing document structure and intent annotations together with clickable navigation to any element.
- `stylesheet`: Per-template stylesheet (seeded from brand rules) defining document and paragraph styles (typeface, size, spacing, colour). Stored as brand snapshot + local overrides.
- `brand-rules`: Workspace-level typography/spacing defaults that seed new template stylesheets. Managed in a dedicated Stylesheets area.
- `template-history`: Named version checkpoints on a template, with auto-save drafts between checkpoints. Browse, compare, and restore.

### Modified Capabilities

- `document-import`: DOCX import now produces a single project block containing a full PT array, rather than one project block per paragraph.
- `intent-markup`: Intent annotation moves from block-level toolbar + prompt dialogs to selection-based context menu + floating popover. Condition/repeat intents annotate a *range* of PT content rather than a single block.
- `template-storage`: Block model schema updated — project blocks now carry an array of PT elements (not a single PT block). Stylesheet reference (ID + local overrides) added to template record.

## Impact

- **Block model schema change (BREAKING)**: existing templates stored with the old per-paragraph block model will need a migration. The `content` field on a text block changes from `[single PT block]` to `[PT block array]`.
- `apps/web/src/components/BlockCanvas.tsx` — complete rewrite
- `apps/web/src/lib/pt-bridge.ts` — updated to handle multi-block PT arrays per project block
- `apps/api/src/docx.rs` — import grouping logic updated
- `apps/api/migrations/` — migration for template block model shape + new `stylesheets` table + brand rules in workspace settings
- New pages: `StylesheetsPage`, `StylesheetEditorPage`
- New right-panel components: `DocumentMapPanel`, `StylesheetPanel`, `HistoryPanel`

## Non-goals

- Typst compilation or PDF preview (Preview mode remains disabled — that is the next change after LLM bridge)
- Dark mode
- Collaborative editing / real-time sync
- Import of DOCX paragraph styles into the template stylesheet
- Mobile / responsive editing

## Phase

Phase 1 — template authoring foundation, prior to LLM bridge and data upload.
