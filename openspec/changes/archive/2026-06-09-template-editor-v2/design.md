## Context

The v1 template builder shipped with a per-paragraph block model and separate Tiptap instances per block. Testing with a real DOCX revealed that this granularity is wrong: project blocks should represent *sections* (units of template logic), not individual paragraphs. The v1 UX also lacks the editing feel of a real document editor — no persistent toolbar, no contextual intent markup, no document navigation.

This change rebuilds the editing surface on the right model before the LLM bridge is added. It also introduces the right-hand panel (Document Map, Stylesheet, History) and the stylesheet/brand-rules system that will underpin PDF output quality.

Current state:
- `BlockCanvas.tsx`: array of independent Tiptap editors, one per project block
- Block model: `{ type: "text", content: [single PT block], conditionIntent?, repeatIntent? }` — a custom wrapper around PT, not PT itself
- Intent markup: per-block toolbar with prompt dialogs
- No right-hand panel; no stylesheet; no history

## Goals / Non-Goals

**Goals:**
- Unified PT-extended block model: the block model is a PT array where intent-annotated ranges are `_type: "section"` custom PT types; no separate project-block wrapper concept
- Single Tiptap editor for the whole document; section nodes in ProseMirror schema
- Selection-based intent markup with floating popover (unified gesture for all three types)
- Visual intent annotations: inline chips for fields, left-border stripe for condition/repeat
- Right-hand panel with Document Map, Stylesheet, and History tabs
- Per-template stylesheet (brand snapshot + local overrides); workspace brand rules
- Stylesheet management area in app navigation
- Block model migration for existing templates

**Non-Goals:**
- PDF preview / Typst compilation (Preview mode stays disabled)
- Collaborative editing
- Import of DOCX paragraph styles into template stylesheet
- Mobile layout

## Decisions

### 1. Block model as PT-extended — section as a PT custom type

**Decision**: The block model is a PT array. Intent-annotated ranges are represented as `_type: "section"` custom PT block objects — a PT extension, not a separate wrapper concept. Plain content is represented as standard `_type: "block"` PT elements at the top level. The "project block" concept is retired; sections are first-class PT.

```json
[
  { "_type": "block",   "_key": "a", "style": "h1",     "children": [...] },
  { "_type": "block",   "_key": "b", "style": "normal",  "children": [...] },
  { "_type": "section", "_key": "c", "repeatIntent": "one row per line item",
    "content": [
      { "_type": "block", "_key": "d", "style": "normal", "children": [...] }
    ]
  },
  { "_type": "block",   "_key": "e", "style": "normal",  "children": [...] }
]
```

A section with no intent is still valid (e.g. after removing an intent without merging back). The top-level array is a mix of standard PT blocks and section types.

**Why**: PT allows custom `_type` values — the extension mechanism is intentional. Framing sections as a PT custom type keeps the block model unified: it is all PT, with sections as a first-class member rather than an external envelope. The previous `{ type: "text", content: [...] }` project block had no PT identity; `{ "_type": "section", ... }` does.

**Alternative considered (Option A — range markers)**: Encode grouping via `_sectionId` on individual PT blocks, keeping the array fully flat. Rejected: implicit grouping via shared ID is fragile and hard to reason about when blocks are reordered.

**Alternative considered (Option C — project block wrapper)**: Keep the existing outer envelope. Rejected: introduces two separate representation concepts (PT and project block) where one unified model can serve both.

---

### 2. ProseMirror section node

**Decision**: In the ProseMirror schema, `_type: "section"` PT objects map to a custom `section` block node that wraps paragraph/heading children and carries `conditionIntent?` and `repeatIntent?` attributes. Standard PT `_type: "block"` objects map to paragraph/heading nodes directly inside `doc`.

```
doc
├── heading (level 1) "Invoice"     ← from top-level PT block
├── paragraph "Date: ..."           ← from top-level PT block
├── section [repeatIntent="..."]    ← from PT section type
│   └── paragraph "Item | Qty"
└── paragraph "Total: ..."          ← from top-level PT block
```

**Why**: A single editor requires structural section nodes in ProseMirror. The PT bridge maps section types to section nodes and back — serialisation is in one place.

**Alternative considered**: Maintain multiple Tiptap instances per section. Rejected: doesn't address document-flow feel; split/merge becomes external state management.

---

### 3. PT bridge update — section ↔ PT section type

**Decision**: `ptToProsemirror` maps top-level PT `_type: "block"` entries to paragraph/heading nodes directly in `doc`; `_type: "section"` entries to `section` nodes containing their `content` array as children. `prosemirrorToPt` is the inverse: paragraph/heading nodes at `doc` level → top-level PT blocks; `section` nodes → PT section objects with a `content` array.

**Why**: The PT bridge is the canonical serialisation layer. Extending it to handle both PT block types and the new section type keeps serialisation in one place.

---

### 4. DOCX import — single PT section

**Decision**: `parse_docx` returns a block model with a single `_type: "section"` entry (no intent) whose `content` array holds all PT elements from the document in sequence. No attempt to infer section boundaries from the document structure.

**Why**: Any automated section boundary inference would be heuristic and likely wrong. The user is better placed to carve out sections themselves via the intent markup gesture. Starting with one flat section keeps the import simple and predictable.

---

### 4. Intent markup — selection + floating popover

**Decision**: A single toolbar button and context menu item trigger the intent popover. The popover presents three options (Field / Conditional / Repeat); options are enabled/disabled based on whether the selection is inline or spans block boundaries. No separate per-block toolbars.

Field disabled if selection spans multiple paragraphs. Conditional and Repeat disabled if selection is within a single text node (pure inline).

**Why**: A unified gesture is simpler to learn and keeps the toolbar uncluttered. The popover can communicate which options are valid for the current selection rather than requiring the user to know in advance.

---

### 5. Section split/merge on intent application

**Decision**: When a user applies a block-level intent to a selection that spans part of an existing section, the section is automatically split: content before the selection becomes one section, the selected content becomes a new annotated section, content after becomes another section. On intent removal, adjacent plain sections are **not** automatically merged — a separate "merge sections" action handles that.

**Why**: Auto-split is necessary (you can't annotate half a section without splitting). Auto-merge on removal is surprising and lossy — the user may have split sections intentionally for other reasons. Keeping sections separate after removal is safe; merging is an explicit opt-in.

---

### 6. Stylesheet storage — brand snapshot + overrides

**Decision**: Template `stylesheet` column stores a JSON object:
```json
{
  "brand_snapshot": { ...brand rules at template creation time... },
  "overrides": { ...per-template changes... }
}
```
Effective stylesheet is computed as `merge(brand_snapshot, overrides)`. Brand rules are stored in a `workspace_settings` JSONB column (keyed `brand_rules`).

**Why**: Storing only overrides would create a dependency on the live brand rules, causing templates to change when brand rules change — the exact problem this model is designed to avoid. Storing a full snapshot makes templates self-contained. The overrides layer allows template-specific adjustments without losing the brand provenance.

---

### 7. Template version history — append-only drafts table

**Decision**: A new `template_versions` table stores the block model at each auto-save and each named checkpoint:

```sql
CREATE TABLE template_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    block_model JSONB NOT NULL,
    label TEXT,              -- NULL for auto-save drafts
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX template_versions_template_id_idx ON template_versions(template_id);
```

Auto-save drafts have `label = NULL`. Named checkpoints have a user-provided label. A rolling cleanup job removes auto-save drafts older than 30 days (named checkpoints are kept indefinitely).

**Why**: Append-only is simple and auditable. JSONB storage matches the primary template table. Separating auto-save drafts (ephemeral) from named checkpoints (permanent) by the nullable `label` column keeps the schema minimal.

---

### 8. Right-hand panel — tabbed, always-visible

**Decision**: The right panel is a fixed-width column (~280px) with three tabs at the top. It is always visible in Build mode; hidden in Preview and Data modes (which need the full width). The active tab persists in local storage per-template.

**Why**: Document Map is most useful during active editing — hiding it behind a toggle would reduce discoverability. A fixed column avoids layout shifts when toggling. 280px is wide enough for the map and narrow enough to leave comfortable editing space on 1280px+ screens.

---

### 9. Block model migration

**Decision**: A migration script (`0004_migrate_block_model_v2.sql`) converts existing templates from the old project-block format to the new PT-extended format. Each old entry `{ "type": "text", "content": [single PT block], ... }` becomes a `{ "_type": "section", "_key": "...", "content": [PT block], "conditionIntent": ..., "repeatIntent": ... }`. Divider blocks become `{ "_type": "block", "style": "divider", "_key": "..." }`. Run before deploying the new API.

```sql
UPDATE templates
SET block_model = jsonb_build_object(
    'blocks',
    (
        SELECT jsonb_agg(
            CASE
                -- old text block: convert to _type: section
                WHEN block->>'type' = 'text' THEN
                    jsonb_build_object(
                        '_type',         'section',
                        '_key',          COALESCE(block->>'_key', gen_random_uuid()::text),
                        'content',
                            CASE
                                WHEN jsonb_typeof(block->'content') = 'array'
                                THEN block->'content'
                                ELSE jsonb_build_array(block->'content')
                            END,
                        'conditionIntent', block->'conditionIntent',
                        'repeatIntent',    block->'repeatIntent'
                    )
                -- old divider block: convert to top-level PT block with style divider
                WHEN block->>'type' = 'divider' THEN
                    jsonb_build_object(
                        '_type', 'block',
                        '_key',  COALESCE(block->>'_key', gen_random_uuid()::text),
                        'style', 'divider',
                        'children', '[]'::jsonb
                    )
                -- already migrated or unknown: pass through
                ELSE block
            END
        )
        FROM jsonb_array_elements(block_model->'blocks') AS block
    )
)
WHERE block_model->'blocks' IS NOT NULL;
```

**Why**: The schema change is breaking — old project-block wrappers must become PT section types. The migration is idempotent (entries already having `_type` are passed through unchanged).

## Risks / Trade-offs

- **Single editor complexity** → ProseMirror section nodes are non-trivial to implement correctly, especially split/merge behaviour. Mitigation: write thorough unit tests for the PT bridge and section node commands before integrating with the full UI.

- **Block model migration irreversibility** → Once the migration runs, the old format is gone. Mitigation: take a database backup before running; the migration SQL is reviewed before deployment.

- **Stylesheet system scope** → Stylesheets could grow unboundedly in complexity (font embedding, colour palettes, per-style line rules). Mitigation: v1 stylesheet supports only the properties listed in the spec; additional properties are additive and non-breaking.

- **History storage growth** → Auto-save every 2 seconds on active editing could produce many draft rows. Mitigation: rolling 30-day cleanup; JSONB compression in PostgreSQL is effective for repeated similar documents.

## Migration Plan

1. Deploy migration `0004_migrate_block_model_v2.sql` against production database.
2. Deploy new API (includes updated template handlers, new `/api/stylesheets` routes, new `/api/templates/:id/versions` routes).
3. Deploy new frontend (single-editor canvas, right panel, stylesheets area).
4. Smoke-test: load an existing template, verify block model renders correctly, verify intent markup works.

Rollback: restore database backup; revert API and frontend deploys.

## Open Questions

- Should the stylesheet editor support custom font uploads, or only Google Fonts / system fonts initially?
- Rolling 30-day cleanup for auto-save drafts — should this be configurable per workspace?
- Should "merge sections" be an explicit button in the toolbar, or only available via right-click context on a section boundary?
