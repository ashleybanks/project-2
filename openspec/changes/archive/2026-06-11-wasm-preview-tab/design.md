## Context

The `typst-compiler` crate already compiles clean to `wasm32-unknown-unknown` (confirmed spike, 2026-06-07). The `InMemoryWorld` implementation uses a `HashMap`-backed virtual filesystem — no disk I/O — making it inherently WASM-compatible. The crate currently builds as an `rlib`; it needs a `cdylib` target and `wasm-bindgen` annotations to produce a usable browser module.

The frontend has a three-mode toggle (Build / Preview / Data) in `TemplatePage.tsx`. Preview and Data are currently disabled. The goal is to enable Preview by wiring the WASM renderer end-to-end.

The frontend's canonical block representation (`PtTopLevel[]`) differs from the compiler's internal `BlockModel`. The frontend stores intents-level data (`fieldIntent` nodes, sections with `conditionIntent`/`repeatIntent` strings); the compiler expects a resolved model. For this change, only the plain-text subset of `PtTopLevel[]` is handled — the mapping is straightforward.

## Goals / Non-Goals

**Goals:**
- Ship a working end-to-end WASM preview path
- Enable the Preview tab button for all templates
- Render a PDF from the current editor state on tab switch
- Establish the integration patterns (WASM load, JS call, PDF display) that future preview enhancements build on

**Non-Goals:**
- Handling `fieldIntent` nodes or sections with intents (deferred)
- Applying stylesheet properties to the Typst output (deferred)
- Live/reactive preview on every edit (deferred)
- Server-side render endpoint

## Decisions

### 1. Option A: Rust handles the PtTopLevel → BlockModel mapping

The WASM function accepts the frontend's raw JSON (`PtTopLevel[]`) and performs the mapping to `BlockModel` internally. The alternative (Option B) would have TypeScript map to `BlockModel` shape before calling WASM.

**Rationale:** Keeps the mapping in one place. As intent resolution and richer block types are added, the mapping logic stays in Rust where it can be tested natively. TypeScript callers remain simple and stable.

### 2. wasm-pack with `--target bundler`, loaded via `vite-plugin-wasm`

`--target bundler` outputs an ES module compatible with Vite's import pipeline. `vite-plugin-wasm` handles the `*.wasm` asset import and top-level `await` for the init call.

Alternative: `--target web` requires an explicit `await init()` call and doesn't integrate as cleanly with Vite's module graph. Rejected for additional ceremony.

### 3. New `wasm.rs` module in the compiler crate, behind a `wasm` feature flag

The `wasm-bindgen` dependency and `cdylib` crate type only activate under `cfg(feature = "wasm")`. Native builds (API, tests) are unaffected.

A new `frontend_model.rs` (or inline types in `wasm.rs`) defines serde-deserializable structs matching the frontend's JSON schema. A `map_to_block_model` function converts these to the existing `BlockModel`.

### 4. Render triggered on Preview tab switch, not reactively

On first switch to the Preview tab, the WASM module is loaded (if not already) and `render_preview` is called with the current `blocks` and `stylesheet` state. The result is displayed as a PDF blob URL in an `<iframe>`.

A manual "Refresh" button allows re-rendering after edits. Reactive rendering on every keystroke is deferred — it would require debouncing and background Worker scheduling.

### 5. PDF blob URL displayed in an `<iframe>`

The simplest approach for displaying PDF bytes. The browser's built-in PDF viewer handles pagination and zoom. An `<object>` or PDF.js are alternatives but add complexity without clear benefit at this stage.

### 6. Empty `{}` as the data payload

`render()` requires a `serde_json::Value` payload. An empty object satisfies the call and the `InMemoryWorld` (which always provides `data.json`). Since plain-text templates have no `data.*` references in the compiled Typst, the empty payload causes no errors.

## Risks / Trade-offs

- **WASM binary size** — Estimated 3–8 MB uncompressed, 1–3 MB Brotli. Loaded once, cached by the browser. Acceptable for a preview-focused feature; monitor at build time.
- **Initial load latency** — The WASM module instantiation adds a one-time delay on first Preview tab switch. Mitigated by lazy-loading (only load on first switch, not on page load).
- **`fieldIntent` nodes in real templates** — The mapping function will encounter `fieldIntent` children in templates that have been partially marked up. These are silently skipped (rendered as empty spans) in this phase. A future change will handle them properly. This is a known and acceptable gap for the plumbing phase.
- **`vite-plugin-wasm` dependency** — Adds a build-time dev dependency. Low risk; the plugin is stable and widely used in Rust/Wasm projects.

## Open Questions

- Should the Preview tab show a loading spinner while the WASM module initialises, or just while the render call is in-flight? (Both, probably — but the UX detail can be decided during implementation.)
- Should `fieldIntent` nodes silently produce blank text, or should the preview show a visible placeholder like `[…]`? This affects whether users understand why some content is missing. Lean toward visible placeholder, but can be addressed as a follow-on.
