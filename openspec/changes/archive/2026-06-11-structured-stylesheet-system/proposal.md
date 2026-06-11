## Why

The current brand rules model is a flat set of five fields (font family, font size, heading font, accent colour, paragraph spacing) that doesn't map to how document styles actually work. Users need per-paragraph-style control over sizing and spacing, and the template Styles tab is currently read-only. This change replaces the flat model with a structured stylesheet that reflects real document typography while remaining simple enough to edit in a sidebar panel.

## What Changes

- **Replace `BrandRules` with `StylesheetDef`**: two global font tokens (heading font, body font), two global colour tokens (heading colour, body colour), and per-style entries for size + spacing — replacing the current five flat fields. **BREAKING** for existing brand rules data (existing values will be ignored; users re-enter preferences).
- **Brand rules page** gains explanation copy and an accordion UI (Heading styles / Text styles / Table styles), with global font/colour tokens above the accordion. Always shows the full fixed style set.
- **Template Styles tab** becomes editable in-panel with auto-save; accordion sections are shown/hidden dynamically based on what styles are actually present in the template's block model.
- **Template creation** seeds the new template's stylesheet with a full copy of the current user's brand rules at creation time.
- **Font selection** replaced with a curated dropdown of ~15 Google Fonts (sans-serif + serif groups), plus Carlito labelled "Carlito (Calibri-compatible)". All units changed from px to pt.

## Capabilities

### New Capabilities
- `stylesheet-editor`: Editable accordion UI for managing structured stylesheet data — used in both the brand rules page and the template Styles tab.

### Modified Capabilities
- `brand-rules`: Requirements change — data model moves from flat `BrandRules` to structured `StylesheetDef`; page gains explanation copy and accordion UI.
- `stylesheet`: Requirements change — template stylesheet is now a full `StylesheetDef` seeded from brand rules at creation; Styles tab becomes editable with dynamic accordion.

## Impact

- `apps/web/src/lib/api.ts` — `BrandRules` and `Stylesheet` types replaced with `StylesheetDef`
- `apps/web/src/pages/StylesheetsPage.tsx` — full rewrite to accordion layout
- `apps/web/src/components/RightPanel.tsx` — `StylesheetTab` rewritten to editable accordion with dynamic style derivation from block model; new `updateTemplate` call for stylesheet saves
- `apps/api/src/stylesheets/handlers.rs` — accept/return `StylesheetDef` shape (JSONB, no structural change to DB)
- `apps/api/src/templates/handlers.rs` — POST /templates seeds stylesheet from brand rules
- No DB migrations required (both columns are already JSONB)

## Non-goals

- Custom font upload (proprietary brand fonts) — out of scope for this phase
- Google Fonts API search/picker — curated list only
- Migrating existing saved brand rule data — existing values discarded; users re-enter
- Live preview of style changes in the canvas — styles are stored only; rendering is a future concern
- Per-run or per-section style overrides

## Phase

Phase 1 — core template builder.
