## 1. TypeScript Types

- [x] 1.1 Replace `BrandRules` and `Stylesheet` interfaces in `apps/web/src/lib/api.ts` with `ParagraphStyle`, `TextStyle`, `TableCellStyle`, and `StylesheetDef`. Update `TemplateDetail.stylesheet` to be `StylesheetDef`. Remove `Stylesheet` (snapshot+overrides shape). **AC**: TypeScript compiles cleanly with no references to the old types.

- [x] 1.2 Define the `FONTS` constant in `apps/web/src/lib/fonts.ts` (new file): an array of `{ value: string; label: string; group: "Sans-serif" | "Serif" | "Special" }` for the 15 curated fonts, with Carlito labelled "Carlito (Calibri-compatible)". **AC**: All 15 fonts present, correctly grouped.

## 2. Stylesheet Editor Component

- [x] 2.1 Create `apps/web/src/components/StylesheetEditor.tsx` — a shared component that accepts `value: StylesheetDef`, `onChange: (v: StylesheetDef) => void`, and `visibleStyles?: StyleKey[]` (optional; if omitted, shows all styles). Renders: global tokens (heading font, body font, heading colour, body colour) above the accordion; then three accordion groups (Heading styles, Text styles, Table styles). **AC**: Component renders without errors and calls `onChange` on any field edit.

- [x] 2.2 Implement the font dropdown within `StylesheetEditor` using the `FONTS` constant: a `<select>` grouped with `<optgroup>` labels (Sans-serif / Serif / Special). Used for both heading font and body font fields. **AC**: Dropdown shows all 15 fonts in correct groups; Carlito label is correct.

- [x] 2.3 Implement the colour swatch+hex input within `StylesheetEditor`. A 16×16px swatch (`<div>` with `background-color`) paired with a text input for hex. Clicking swatch triggers a hidden `<input type="color">` whose value is kept in sync. **AC**: Swatch updates when hex is typed; hex input updates when colour picker is used.

- [x] 2.4 Implement per-style rows in `StylesheetEditor`: compact 3-column inline layout (size / before / after) using `h-7` inputs with pt labels. Normal style adds a fourth indent size field. Table styles add line width (pt) and line colour (swatch+hex). **AC**: All field counts match spec; inputs update the correct `StylesheetDef` key.

- [x] 2.5 Implement accordion open/close state in `StylesheetEditor` with localStorage persistence keyed by a prop (e.g. `storageKey?: string`). Default: Heading styles open, others closed. **AC**: Accordion state persists across page reloads when `storageKey` is provided.

## 3. Brand Rules Page

- [x] 3.1 Rewrite `apps/web/src/pages/StylesheetsPage.tsx` to use `StylesheetEditor` with no `visibleStyles` filter (full set always shown). Replace the current flat form with the new component. Add explanation copy above the editor: "Brand rules are your workspace defaults. New templates start with a complete copy of these settings. Changes here don't affect templates you've already created." **AC**: Page renders with explanation copy and full accordion; save calls `PUT /stylesheets/brand-rules` with `StylesheetDef` payload.

- [x] 3.2 Update `getBrandRules` and `updateBrandRules` in `apps/web/src/lib/api.ts` to use `StylesheetDef` as the type. **AC**: TypeScript types match; no `BrandRules` references remain in the API module.

## 4. Template Styles Tab

- [x] 4.1 Add a `deriveVisibleStyles(blocks: PtTopLevel[]): StyleKey[]` utility to `apps/web/src/lib/styleUtils.ts` (new file). Returns the subset of style keys present in the block model: always includes `"normal"`; includes `"h1"`–`"h6"` if blocks with those styles exist; includes `"tableData"` if any table exists; includes `"tableHeader"` if any cell with `isHeader: true` exists. **AC**: Unit tests pass for: empty blocks (normal only), blocks with h1+h2 (normal+h1+h2), blocks with table+headers (normal+tableData+tableHeader).

- [x] 4.2 Rewrite `StylesheetTab` in `apps/web/src/components/RightPanel.tsx` to use `StylesheetEditor`. Pass `visibleStyles` derived from the current `blocks` prop (subscribe to editor updates via the same poll/event pattern as `DocumentMapTab`). Pass the template's `stylesheet` as `value`. On `onChange`, debounce 2s and call `PUT /templates/:id` with the updated stylesheet. **AC**: Styles tab is editable; changes auto-save; accordion shows only styles present in the document.

- [x] 4.3 Add `stylesheet` to the `updateTemplate` API call signature in `apps/web/src/lib/api.ts` and confirm `RightPanel` passes `templateId` down to the new `StylesheetTab` for the save call. **AC**: A stylesheet change from the Styles tab results in a `PUT /templates/:id` request with the correct payload.

## 5. Template Stylesheet Seeding

- [x] 5.1 Update `POST /templates` handler in `apps/api/src/templates/handlers.rs` to fetch `users.settings->'brand_rules'` for the authenticated user and write it as the new template's `stylesheet` column value. If no brand rules are set, write `'{}'::jsonb`. **AC**: Creating a template when brand rules are set results in `templates.stylesheet` matching the user's brand rules JSONB exactly.

## 6. API Handler Cleanup

- [x] 6.1 Update `apps/api/src/stylesheets/handlers.rs` to accept and return the `StylesheetDef` shape (no structural change needed — already JSONB pass-through). Remove any documentation or comments referencing `BrandRules`. **AC**: `GET /stylesheets/brand-rules` returns the stored JSONB as-is; `PUT /stylesheets/brand-rules` stores the submitted body as-is.

## 7. Wiring and Cleanup

- [x] 7.1 Remove all remaining references to `BrandRules`, `brand_snapshot`, `overrides`, and the old `Stylesheet` (snapshot+overrides) type from the frontend codebase. **AC**: `grep -r "BrandRules\|brand_snapshot\|overrides" apps/web/src` returns no matches.

- [x] 7.2 Remove the "Edit brand rules →" link from the old `StylesheetTab` (now replaced). Confirm the Styles tab no longer navigates away from the template editor. **AC**: No navigation away from the template page when using the Styles tab.
