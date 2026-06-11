## Context

The current stylesheet system has two problems. First, the data model is too flat: five fields (`fontFamily`, `fontSize`, `headingFont`, `accentColour`, `paragraphSpacing`) can't express per-paragraph-style sizing and spacing, which is what users actually need to control document typography. Second, the template Styles tab is read-only — it just displays the current values with a link to a separate page. Users expect to edit styles in context.

The rendering target is Typst. Typst uses `pt` as its native unit for text size and spacing, so all measurements stored in the stylesheet must be in points to avoid a conversion layer at render time.

No DB migration is required: both `templates.stylesheet` and `users.settings` are already JSONB columns.

## Goals / Non-Goals

**Goals:**
- Replace `BrandRules` with `StylesheetDef`: two global font tokens, two global colour tokens, per-style sizing/spacing
- All measurements stored in `pt` (Typst-compatible)
- Brand rules page and template Styles tab share the same data structure and the same UI component
- Template Styles tab becomes editable in-panel with auto-save
- Styles tab shows/hides accordion sections dynamically based on what styles are present in the block model
- Template creation seeds the stylesheet with a full copy of current brand rules
- Font selection: curated dropdown of ~15 Google Fonts + Carlito
- Brand rules page gains explanation copy about how seeding works

**Non-Goals:**
- Custom font upload
- Google Fonts search/picker
- Migrating existing saved brand rule values (users re-enter)
- Live style preview in the canvas
- Per-section or per-run style overrides

## Decisions

### 1. Data model: global tokens + per-style entries

**Decision**: Two global font tokens (`headingFont`, `bodyFont`) and two global colour tokens (`headingColour`, `bodyColour`) sit at the top level of `StylesheetDef`. Per-style entries hold only the values that genuinely vary by style: `fontSize`, `spacingBefore`, `spacingAfter`. Text styles add `indentSize`; table styles add `lineWidth` and `lineColour`.

```typescript
interface StylesheetDef {
  headingFont?: string       // applied to h1–h6
  bodyFont?: string          // applied to normal, table cells
  headingColour?: string     // hex, applied to h1–h6
  bodyColour?: string        // hex, applied to normal, table cells
  normal?: TextStyle         // { fontSize, spacingBefore, spacingAfter, indentSize }
  h1?: ParagraphStyle        // { fontSize, spacingBefore, spacingAfter }
  h2?: ParagraphStyle
  h3?: ParagraphStyle
  h4?: ParagraphStyle
  h5?: ParagraphStyle
  h6?: ParagraphStyle
  tableHeader?: TableCellStyle  // { fontSize, spacingBefore, spacingAfter, lineWidth, lineColour }
  tableData?: TableCellStyle
}
```

**Why over per-style font/colour**: Font and colour are almost always uniform across all headings (brand consistency). Making them global eliminates 5× repetition and the risk of diverging values across heading levels. Users who need per-heading colour overrides are not the target audience at this stage.

**Alternative considered**: Keep font and colour per-style (maximum flexibility). Rejected: 7 heading/table entries × 5 fields = 35 inputs in a 288px panel before size and spacing are even shown.

---

### 2. Units: `pt` throughout

**Decision**: All numeric measurements (font size, spacing before/after, indent, line width) are stored and displayed in `pt`.

**Why**: Typst uses `pt` as its primary length unit for text (`#set text(size: 12pt)`). Storing in `pt` means zero conversion at render time. Word/DOCX also uses `pt` (twips are 1/20pt, but all user-facing values are pt). Avoids a surprising mismatch where "12px" in the UI produces wrong output in a printed document.

---

### 3. Font selection: curated list of Google Fonts + Carlito

**Decision**: A dropdown of 15 fonts grouped by category. No free-text input. Font names are exact strings usable in Typst.

```
Sans-serif:  Inter, Roboto, Open Sans, Lato, Montserrat, Source Sans 3, Nunito
Serif:       Merriweather, Playfair Display, Lora, EB Garamond, Libre Baskerville
Special:     Carlito  (labelled "Carlito (Calibri-compatible)")
```

**Why Carlito, not Calibri**: Calibri is a Microsoft proprietary font and cannot be freely bundled in the Typst renderer. Carlito is metrically identical (same advance widths), open-licensed, and available as a Google Font. Users who expect Calibri output get visually equivalent results.

**Why curated over free-text**: Free text allows users to enter fonts that won't exist in the renderer, producing silent fallback failures. A curated list makes the contract explicit: these fonts will work.

---

### 4. Dynamic style derivation in the template Styles tab

**Decision**: The set of visible accordion items in the template Styles tab is derived at render time by scanning `blocks: PtTopLevel[]` (already in component state). The same logic used by the Doc Map tab (walking the block tree) is reused here.

```
Heading styles section:  visible if any block with style h1–h6 exists
Individual hN entry:     visible if that specific level exists
Text styles section:     always visible (normal is always present)
Table styles section:    visible if any PtTable node exists
Table header entry:      visible if any cell with isHeader=true exists
```

**Why not persist which styles are "active"**: Deriving from block model ensures the UI stays in sync automatically as the user edits. No separate tracking field. The Doc Map tab already does this successfully.

---

### 5. Seeding at template creation

**Decision**: `POST /templates` fetches the current user's brand rules from `users.settings.brand_rules` and writes them directly as the new template's `stylesheet` column value.

**Why at creation, not lazily**: Seeding at creation gives the template a coherent starting state immediately. Lazy seeding (on first Styles tab open) would mean templates created before brand rules were set have a different visual starting point, which is confusing.

---

### 6. Stylesheet editing: in-panel auto-save

**Decision**: Editing in the Styles tab triggers a debounced `PUT /templates/:id` with the updated `stylesheet` field. Same debounce pattern (2s) as the existing template name/block auto-save.

**Why not a Save button**: Consistency with how the rest of the template editor works. Users don't expect to manually save style tweaks any more than they manually save text edits.

---

### 7. Accordion UI layout

Global tokens (heading font, body font, heading colour, body colour) sit above the accordion as always-visible fields. The accordion has three groups:

```
[Heading font dropdown]   [Body font dropdown]
[Heading colour swatch+hex]  [Body colour swatch+hex]

▼ Heading styles
  H1  [size pt]  [↑ before pt]  [↓ after pt]
  H2  ...
▶ Text styles
▶ Table styles
```

Per-style rows use a compact 3-column layout (size / before / after as inline labelled inputs, `h-7` height) to fit comfortably in the 288px panel.

Colour inputs: a small 16×16px swatch (CSS `background-color`) paired with a text input for the hex value. Clicking the swatch opens a native `<input type="color">`. This avoids a custom colour picker dependency while still providing visual feedback.

## Risks / Trade-offs

- **Breaking change to existing brand rule data** → Existing `brand_rules` JSONB will have the old shape (`fontFamily`, `fontSize`, etc.) which won't map to `StylesheetDef`. On load, unrecognised keys are ignored; fields will appear empty. Users re-enter their preferences. Acceptable at this stage given the early user count; document clearly in the explanation copy.

- **Panel width at 288px** → Five accordion groups of fields in a narrow panel is tight. Mitigated by: (a) compact 3-column inline rows for per-style size/spacing, (b) global tokens taking 4 fields total above the accordion, (c) accordion collapse means users only see one group at a time. If this proves cramped in practice, the panel can be widened to `w-80` (320px) without other changes.

- **No live preview** → Style changes save and persist but don't reflow the canvas. Users can't see the effect until rendering is built. Acceptable for this phase; mitigated by labelling the tab clearly as "Styles" (not "Preview").

- **Carlito substitution** → Users who upload a Calibri-formatted DOCX and select "Carlito (Calibri-compatible)" will get near-identical but not pixel-perfect output. Line breaks may differ in edge cases due to rendering engine differences. This is an acceptable trade-off vs. licensing Calibri.

## Open Questions

- Should the brand rules page show a "last updated" timestamp so users know whether their current templates are in sync? Not in scope for this change but worth noting.
- Should the accordion remember its open/closed state per-template (localStorage)? Probably yes, same pattern as panel collapse — can be added during implementation without design input.
