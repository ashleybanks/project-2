## Why

Users need a way to see a rendered PDF of their template while building it. Without a preview, the build experience is blind — you compose blocks and styles but have no sense of the actual output until a full render pipeline is wired. Establishing the WASM preview path now creates the rendering infrastructure that all future preview modes (with data, with resolved intents) will share.

## What Changes

- The `typst-compiler` crate is extended with a `wasm` feature: `crate-type = ["cdylib"]`, `wasm-bindgen` dependency, and a `render_preview` function exposed to JS.
- `render_preview` accepts the frontend's `PtTopLevel[]` JSON and a `StylesheetDef` JSON, maps them to the internal `BlockModel`, compiles to Typst source, renders to PDF bytes, and returns them to JS.
- The WASM module is built with `wasm-pack` and bundled into the web app.
- The Preview mode button in `TemplatePage` is enabled. Clicking it calls `render_preview` with the current editor state and displays the result as a PDF in an `<iframe>`.

## Capabilities

### New Capabilities

- `wasm-preview`: In-browser PDF preview of a template via the Typst WASM renderer. Accepts the editor's `PtTopLevel[]` block model and stylesheet; renders to a PDF blob displayed in the Preview tab. Scoped to plain-text templates (no unresolved intents) for the initial plumbing phase.

### Modified Capabilities

*(none — the Preview tab exists but is disabled; this change enables it for the first time)*

## Non-goals

- Intent resolution: `fieldIntent` nodes are not handled in this change. Templates with unresolved intents are out of scope.
- Live/reactive preview: the render is triggered on tab switch only, not on every edit.
- Data loading: no payload data is passed to the renderer; an empty `{}` object is used.
- Stylesheet-to-Typst mapping: the stylesheet is accepted but not yet applied to the render output. Font/colour/size application is deferred.
- Server-side render endpoint: all rendering is client-side via WASM.

## Impact

- `crates/typst-compiler/Cargo.toml` — new `[features]` section; `wasm-bindgen` added under `wasm` feature
- `crates/typst-compiler/src/lib.rs` — new `wasm_bindgen` entry point
- `apps/web/` — `wasm-pack` output added to the module graph; Preview tab wired in `TemplatePage.tsx`
- Build tooling — `wasm-pack build` step added to the web build process
- Phase: Template Builder (Phase 1)
