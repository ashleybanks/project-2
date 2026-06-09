## 1. Database: Migration and New Tables

- [x] 1.1 Write migration `0004_migrate_block_model_v2.sql`: convert each old `{ "type": "text", ... }` project-block entry to `{ "_type": "section", "_key": "...", "content": [...], "conditionIntent": ..., "repeatIntent": ... }`; convert `{ "type": "divider" }` entries to `{ "_type": "block", "style": "divider", ... }`. Migration is idempotent (entries already carrying `_type` pass through unchanged). Acceptance: migration runs cleanly; existing templates load with the new PT-extended schema.
- [x] 1.2 Write migration `0005_create_stylesheets.sql`: add `stylesheet` JSONB column to `templates` (default `{}`); add `brand_rules` JSONB to a `workspace_settings` table (or a `settings` column on `users`). Acceptance: migration runs cleanly; existing template rows have `stylesheet = {}`.
- [x] 1.3 Write migration `0006_create_template_versions.sql`: `template_versions` table with `id`, `template_id` (FK), `block_model` JSONB, `label` TEXT nullable, `created_at`. Add index on `template_id`. Acceptance: table created; FK cascade delete works.

## 2. Backend: Stylesheet and Brand Rules API

- [x] 2.1 Add `GET /api/stylesheets/brand-rules` and `PUT /api/stylesheets/brand-rules` handlers: read/write brand rules JSONB from workspace settings. Auth required. Acceptance: round-trip brand rules through the API.
- [x] 2.2 Update `POST /api/templates` to seed `stylesheet` from brand rules snapshot on creation (fetch current brand rules, store as `brand_snapshot`, `overrides: {}`). Acceptance: created template has `stylesheet.brand_snapshot` populated.
- [x] 2.3 Update `GET /api/templates/:id` to return `stylesheet` in the response. Update `PUT /api/templates/:id` to accept and persist `stylesheet` overrides. Acceptance: stylesheet round-trips through the API.

## 3. Backend: Template Version History API

- [x] 3.1 Add `GET /api/templates/:id/versions` handler: return list of versions (id, label, created_at) for the template, ordered by `created_at` desc. Auth required; only own templates. Acceptance: returns version list; 404 for another user's template.
- [x] 3.2 Add `POST /api/templates/:id/versions` handler: create a named checkpoint with the current block model and a user-provided label. Acceptance: checkpoint stored; appears in version list.
- [x] 3.3 Add `POST /api/templates/:id/versions/:version_id/restore` handler: replace template block model with the version's block model; auto-save current state as a draft before restoring. Acceptance: template block model updated; a draft version created before the restore.
- [x] 3.4 Update auto-save path (`PUT /api/templates/:id`) to also insert a draft row into `template_versions` (label NULL) on every save. Acceptance: each auto-save creates a version row; History tab can read them.

## 4. Frontend: ProseMirror Section Node

- [x] 4.1 Define `SectionNode` Tiptap extension: a block node wrapping arbitrary paragraph/heading content, with `conditionIntent` and `repeatIntent` string attributes (default null). Acceptance: node defined; renders as a `<div data-section>` wrapper; attributes persist through serialise/deserialise.
- [x] 4.2 Update `ptToProsemirror` in `pt-bridge.ts`: map top-level `_type: "block"` PT entries to paragraph/heading nodes directly in `doc`; map `_type: "section"` entries to `section` nodes containing their `content` array as children. Acceptance: unit test — a block model with a mix of top-level PT blocks and a section entry maps correctly; `section` node carries `conditionIntent`/`repeatIntent` attributes.
- [x] 4.3 Update `prosemirrorToPt` in `pt-bridge.ts`: paragraph/heading nodes at `doc` level → top-level `_type: "block"` PT entries; `section` nodes → `_type: "section"` PT objects with `content` array and intent attributes. Acceptance: round-trip test — `prosemirrorToPt(ptToProsemirror(model))` equals the original model for mixed top-level blocks and sections.

## 5. Frontend: Single-Editor Canvas

- [x] 5.1 Rewrite `BlockCanvas.tsx` as a single Tiptap editor instance using the updated PT bridge. Remove per-block editor instances. Acceptance: a template with a mix of top-level PT blocks and section entries renders as a continuous document in one editor; edits update the block model correctly via auto-save.
- [x] 5.2 Add visual section boundary rendering: `SectionNode` renders with a subtle left-border or background tint when it carries an intent attribute. Plain sections (no intent) render with no decoration. Acceptance: sections with intents are visually distinct; plain sections are invisible boundaries.
- [x] 5.3 Implement section split command: given a selection spanning part of a section, split the section into up to three sections (before, selected, after). Acceptance: applying a block-level intent to a mid-section selection correctly splits the section in the ProseMirror doc and block model.

## 6. Frontend: Intent Markup — Unified Gesture

- [x] 6.1 Add persistent formatting toolbar above the canvas: Bold, Italic, Underline, H1, H2, H3, and an Intent (◈) button. Acceptance: formatting actions apply correctly; Intent button triggers the intent popover.
- [x] 6.2 Implement `IntentPopover` component: floating popover appearing near the selection with three options (Field / Conditional / Repeat). Field disabled when selection spans multiple paragraphs. Conditional/Repeat disabled for pure inline selections. Includes a text input for the intent label/description. Acceptance: correct options enabled/disabled for each selection type; label input required before applying.
- [x] 6.3 Wire intent actions: Field applies `setFieldIntent` to the selection; Conditional triggers section split + sets `conditionIntent`; Repeat triggers section split + sets `repeatIntent`. Acceptance: each action produces the correct block model change; auto-save fires.
- [x] 6.4 Add right-click context menu on editor content with an "Add intent" option that opens the same `IntentPopover`. Acceptance: context menu appears on right-click; intent popover behaviour identical to toolbar path.

## 7. Frontend: Intent Visual Annotations

- [x] 7.1 Render field intent chips: `FieldIntentNode` renders as an inline chip in the accent colour. Clicking the chip opens the `IntentPopover` pre-filled with the current label, with Edit and Remove actions. Acceptance: chip renders; clicking opens popover; editing updates the label; removing restores plain text.
- [x] 7.2 Render block intent stripe: `SectionNode` with `conditionIntent` or `repeatIntent` renders a left-border stripe and a ◈ icon button at the top-left of the section. Acceptance: stripe visible for annotated sections; invisible for plain sections; single accent colour used for both intent types.
- [x] 7.3 Implement block intent popover (◈ click): shows full intent text, an Edit field, and a Remove button. Edit updates the attribute; Remove clears the intent and removes the stripe. Acceptance: edit persists through auto-save; remove clears the annotation without affecting section content.

## 8. Frontend: Right-Hand Panel

- [x] 8.1 Add the right-hand panel layout: fixed-width column (~280px) with three tab buttons (Document Map, Stylesheet, History) at the top. Visible in Build mode, hidden in Preview/Data modes. Active tab persists in localStorage per template ID. Acceptance: panel renders; tabs switch content; hidden in non-Build modes.
- [x] 8.2 Implement Document Map tab: derive a flat list of structural entries (headings, paragraphs) and intent entries (field intents nested under their paragraph, block intents alongside their section) from the ProseMirror document. Update on every document change. Acceptance: map reflects current document structure; intent annotations appear inline with structure entries.
- [x] 8.3 Implement Document Map navigation: clicking any entry scrolls the canvas to the corresponding ProseMirror node and briefly highlights it. Acceptance: clicking a heading scrolls to it; clicking an intent entry scrolls to the annotated section.
- [x] 8.4 Implement Stylesheet tab (basic): display the current stylesheet name (or "Default") and key properties (font, size). Include a "Edit stylesheet" link (placeholder for now). Acceptance: tab renders without errors; shows stylesheet metadata from the template response.
- [x] 8.5 Implement History tab: fetch `GET /api/templates/:id/versions` and render the list. Named checkpoints visually distinct from auto-save drafts. "Create checkpoint" button opens a label input. "Restore" button on each version triggers the restore API and reloads the canvas. Acceptance: list renders; checkpoint creation works; restore reloads the canvas with the restored block model.

## 9. Frontend: Stylesheets Area

- [x] 9.1 Add `/app/stylesheets` route and `StylesheetsPage`: lists workspace stylesheets (initially just "Brand Rules"). Add entry in app navigation. Acceptance: page renders; navigation link works.
- [x] 9.2 Implement Brand Rules editor on `StylesheetsPage`: form fields for primary font family, base font size, heading font, accent colour (hex colour picker), and default paragraph spacing. `GET /api/stylesheets/brand-rules` and `PUT /api/stylesheets/brand-rules`. Acceptance: brand rules load; edits persist; saved values appear on reload.

## 10. Frontend: DOCX Import Update

- [x] 10.1 Update `apps/api/src/docx.rs` import output: return a single `_type: "section"` entry (no intent) whose `content` array holds all PT elements in sequence, rather than one project block per paragraph. Update `NewTemplatePage` import preview message (e.g. "Imported N paragraphs"). Acceptance: importing a DOCX returns a block model with one `_type: "section"` entry containing one PT block per DOCX paragraph.
