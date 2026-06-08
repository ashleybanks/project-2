## 1. Backend: Database and Template CRUD

- [x] 1.1 Write and run migration `0003_create_templates.sql`: `templates` table with `id`, `user_id`, `name`, `block_model` (JSONB), `created_at`, `updated_at`. Add GIN index on `block_model` and btree index on `user_id`. Acceptance: migration runs cleanly; table visible in PostgreSQL.
- [x] 1.2 Implement `GET /api/templates` — list authenticated user's templates (id, name, created_at, updated_at; no block_model). Acceptance: returns array of user's templates ordered by `updated_at` desc; returns empty array if none; returns 401 if unauthenticated.
- [x] 1.3 Implement `POST /api/templates` — create template with name and optional block_model (defaults to `{"blocks":[]}`). Acceptance: returns 201 with created template including id; block_model stored as provided.
- [x] 1.4 Implement `GET /api/templates/:id` — get full template including block_model. Returns 404 if not owned by requesting user. Acceptance: returns full template for own templates; returns 404 for other users' templates.
- [x] 1.5 Implement `PUT /api/templates/:id` — update block_model and/or name; bumps `updated_at`. Acceptance: block_model persisted exactly as provided including intent marker nodes; `updated_at` updated.
- [x] 1.6 Implement `DELETE /api/templates/:id` — delete own template. Acceptance: returns 204; returns 404 for other users' templates.

## 2. Backend: DOCX Import

- [x] 2.1 [DECISION NEEDED] Evaluate `docx-rs` crate (crates.io) for DOCX parsing vs. direct `zip` + `quick-xml` approach. Check maintenance activity and coverage of w:p/w:r/w:rPr/w:pStyle elements. Document choice in `apps/api/docs/docx-parsing-eval.md`. Acceptance: approach chosen and documented.
- [x] 2.2 Implement DOCX → Portable Text parser in `apps/api/src/docx.rs`. Map: `w:p` → `PtBlock`, `w:r` → `PtSpan`, `w:b` → "strong" mark, `w:i` → "em" mark, `w:pStyle Heading1/2/3` → block style `h1/h2/h3`. Tables: extract cell text as flat blocks. Acceptance: unit test round-trips a sample DOCX containing headings, bold/italic runs, and a table; output matches expected Portable Text structure.
- [x] 2.3 Implement `POST /api/templates/import` — multipart upload handler; validates file is DOCX (zip + `[Content_Types].xml` check); enforces 10MB limit; calls parser; returns block model JSON. Does not persist. Acceptance: uploading a DOCX returns a valid block model; uploading a PDF returns 422; uploading a >10MB file returns 413.

## 3. Frontend: Project Setup and Routing

- [x] 3.1 Install Tiptap packages: `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-heading`, `@tiptap/extension-underline` (underline is not in starter-kit; needed for w:u DOCX mapping). Install `react-query` (TanStack Query) for API state. Acceptance: packages install without peer dependency conflicts; `npm run build` succeeds.
- [x] 3.2 Add React Router routes: `/app/templates` (template list), `/app/templates/new` (create/import), `/app/templates/:id` (canvas). All behind `ProtectedRoute`. Acceptance: routes render without error; unauthenticated users are redirected to sign-in.
- [x] 3.3 Create API client functions in `apps/web/src/lib/api.ts`: `listTemplates()`, `createTemplate()`, `getTemplate()`, `updateTemplate()`, `deleteTemplate()`, `importDocx()`. All call the Axum backend via the Vite proxy. Acceptance: functions exist and TypeScript types are correct; no runtime import errors.

## 4. Frontend: Template List and Creation

- [x] 4.1 Implement `TemplateListPage` (`/app/templates`): fetch and display user's templates with name and last-updated date; "New template" and "Import document" actions; delete with confirmation. Acceptance: lists templates; delete removes the item; empty state shown when no templates exist.
- [x] 4.2 Implement `NewTemplatePage` (`/app/templates/new`): two paths — "Start blank" (creates empty template, navigates to canvas) and "Import DOCX" (file picker, calls import endpoint, previews block count, creates template, navigates to canvas). Acceptance: blank path creates template and opens canvas; import path uploads DOCX, shows success message, opens canvas.

## 5. Frontend: Portable Text ↔ ProseMirror Bridge

- [x] 5.1 Implement `ptToProsemirror(blocks: PtBlock[]) → ProsemirrorDoc` in `apps/web/src/lib/pt-bridge.ts`. Handle: `block` → `paragraph` or `heading`, `span` → `text` node with marks, `fieldIntent` → custom node. Acceptance: unit tests cover headings, bold/italic spans, and fieldIntent nodes round-tripping correctly.
- [x] 5.2 Implement `prosemirrorToPt(doc: ProsemirrorDoc) → PtBlock[]` — inverse of 5.1. Acceptance: round-trip test: `ptToProsemirror(prosemirrorToPt(x)) === x` for all supported node types.

## 6. Frontend: Canvas and Text Editing

- [x] 6.1 Implement `FieldIntentNode` Tiptap extension: an inline node that renders as a coloured chip with the intent label. Supports `setFieldIntent(label)` command (replaces selection) and `removeFieldIntent()` (restores plain text). Acceptance: selecting text and applying the command replaces selection with chip; chip is visually distinct; removing chip restores text.
- [x] 6.2 Implement `BlockCanvas` component: renders a list of blocks from the block model; each text block is an independent Tiptap editor instance using the PT bridge for load/save; heading blocks render with correct heading level. Acceptance: canvas loads block model and renders all blocks; edits to text blocks update local state correctly.
- [x] 6.3 Implement block toolbar (appears on block focus/hover): "Mark as field" (inline — prompts for label, calls `setFieldIntent`), "Make conditional" (block-level — prompts for description, sets `conditionIntent`), "Make repeating" (block-level — prompts for description, sets `repeatIntent`), "Move up", "Move down". Acceptance: each action is reachable; intent labels are prompted via a simple inline input; move up/down reorders blocks.
- [x] 6.4 Implement intent badge rendering: blocks with `conditionIntent` show a blue badge "Condition: [label]"; blocks with `repeatIntent` show a green badge "Repeats: [label]". Badges include an × to remove the intent. Acceptance: badges appear when intents are set; × removes the intent from the block model.

## 7. Frontend: Canvas Page and Save

- [x] 7.1 Implement `TemplatePage` (`/app/templates/:id`): loads template, renders `BlockCanvas`, shows template name (editable), shows workspace mode tabs (Build active, Preview/Data disabled). Acceptance: page loads template and renders canvas; name editable in place.
- [x] 7.2 Implement auto-save or explicit save: on block edit / intent change, collect full block model from canvas state and call `updateTemplate()`. Debounce auto-save at 2 seconds. Show save status ("Saving…" / "Saved"). Acceptance: edits and intent changes persist after page reload; save status indicator updates correctly.
- [x] 7.3 Implement from-scratch block palette: floating "+" button opens a mini picker with "Text block" and "Divider". Selecting adds the block at the end of the canvas. Acceptance: new text blocks are added; new blocks are editable immediately; saved to the template.
