## 1. Rust Crate — WASM Feature Setup

- [x] 1.1 Add `wasm` feature flag to `crates/typst-compiler/Cargo.toml`: set `crate-type = ["cdylib", "lib"]` under `[lib]`, add `wasm-bindgen` as an optional dependency gated on the `wasm` feature.
  **Acceptance:** `cargo build -p typst-compiler` (native) still compiles clean; `cargo build -p typst-compiler --target wasm32-unknown-unknown --features wasm` compiles without error.

- [x] 1.2 Add `wasm-pack` to the workspace toolchain (confirm via `wasm-pack --version` or install if absent). Document the required version in the justfile or README.
  **Acceptance:** `wasm-pack build --target bundler --features wasm crates/typst-compiler` completes and emits a `pkg/` directory.

## 2. Rust Crate — Frontend Model Types and Mapping

- [x] 2.1 Add `crates/typst-compiler/src/frontend_model.rs`: serde-deserializable structs matching the frontend's `PtTopLevel[]` JSON schema (`FrontendBlock`, `FrontendSection`, `FrontendTable`, `FrontendSpan`, `FrontendFieldIntent`). Gate the module on `#[cfg(feature = "wasm")]`.
  **Acceptance:** A unit test round-trips a sample `PtTopLevel[]` JSON string through these structs without error.

- [x] 2.2 Implement `map_to_block_model(blocks: Vec<FrontendTopLevel>) -> BlockModel` in `frontend_model.rs`. Rules: `FrontendBlock` → `Block::Text`; `FrontendSection` with intents → skipped (empty `Block::Text` with no content); `FrontendFieldIntent` children → omitted (silent skip); `FrontendSpan` → `PtChild::Span`.
  **Acceptance:** Unit test: a `PtTopLevel[]` containing headings, paragraphs, bold/italic spans maps to a `BlockModel` that compiles to valid Typst source containing the expected text.

## 3. Rust Crate — WASM Entry Point

- [x] 3.1 Add `crates/typst-compiler/src/wasm.rs` (gated on `#[cfg(feature = "wasm")]`). Expose `render_preview(blocks_json: &str, _stylesheet_json: &str) -> Result<Vec<u8>, JsValue>`. Implementation: deserialize `blocks_json` → `Vec<FrontendTopLevel>`, map to `BlockModel`, call `compile()`, call `render()` with empty payload `{}`, return PDF bytes.
  **Acceptance:** A WASM-compiled version of the function, called from a JS test harness, returns non-empty bytes for a simple text template.

- [x] 3.2 Wire `wasm.rs` into `lib.rs` under `#[cfg(feature = "wasm")]`. Run `wasm-pack build --target bundler --features wasm crates/typst-compiler` and confirm the `pkg/` output includes `typst_compiler.js`, `typst_compiler_bg.wasm`, and `typst_compiler.d.ts`.
  **Acceptance:** `pkg/typst_compiler.d.ts` exports `render_preview(blocks_json: string, stylesheet_json: string): Uint8Array`.

## 4. Frontend — Vite WASM Integration

- [x] 4.1 Install `vite-plugin-wasm` (and `vite-plugin-top-level-await` if needed) as dev dependencies in `apps/web`. Configure both plugins in `vite.config.ts`.
  **Acceptance:** `npm run build` in `apps/web` completes without WASM-related errors; `npm run dev` serves without WASM import errors.

- [x] 4.2 Add the `wasm-pack` `pkg/` output as a local package to `apps/web/package.json` (e.g., `"typst-compiler": "file:../../crates/typst-compiler/pkg"`). Confirm the WASM module can be imported in a throwaway test component.
  **Acceptance:** `import { render_preview } from "typst-compiler"` resolves in the web app without type errors.

## 5. Frontend — Preview Tab Wiring

- [x] 5.1 Create `apps/web/src/lib/wasmPreview.ts`: a module that lazily initialises the WASM module on first call and exports `renderPreview(blocks: PtTopLevel[], stylesheet: StylesheetDef): Promise<Uint8Array>`. Module-level singleton guards against double-init.
  **Acceptance:** Calling `renderPreview` twice in a session logs WASM init once and returns PDF bytes both times.

- [x] 5.2 Create `apps/web/src/components/PreviewPane.tsx`: accepts `blocks` and `stylesheet` props. On mount, calls `renderPreview`, manages loading/error/ready states, and renders an `<iframe>` with a blob URL on success. Shows a loading spinner during render and a plain error message on failure. Includes a "Refresh" button that re-calls `renderPreview` with current props.
  **Acceptance:** Renders a PDF iframe for a simple template; shows a spinner during load; shows error text if `renderPreview` rejects.

- [x] 5.3 In `TemplatePage.tsx`, remove the `disabled` constraint from the Preview mode button (the `onClick={() => m === "build" && setMode(m)` guard and `cursor-not-allowed` style). Replace the hardcoded `title` tooltip. When `mode === "preview"`, render `<PreviewPane blocks={blocks} stylesheet={stylesheet} />` in the main content area instead of `<BlockCanvas>`.
  **Acceptance:** Clicking Preview switches the workspace to preview mode; the PDF renders for a plain-text template; switching back to Build restores the editor.

## 6. Build Tooling

- [x] 6.1 Add a `wasm-build` recipe to the `justfile` that runs `wasm-pack build --target bundler --features wasm crates/typst-compiler --out-dir apps/web/crates/typst-compiler/pkg`. Add it as a prerequisite to the existing `dev` / `build` recipes (or document it as a manual one-time step if preferred).
  **Acceptance:** Running `just wasm-build` produces a fresh `pkg/` without manual steps; the web app picks up the output.
