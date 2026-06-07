## 1. Workspace Setup

- [x] 1.1 Create `crates/typst-compiler/` as a new Rust library crate. Add it to the root `Cargo.toml` workspace members. Add `typst-compiler` as a dependency of `apps/api`. Acceptance: `cargo build` succeeds across the workspace with the new crate present.
- [x] 1.2 Add `typst`, `typst-pdf`, and `typst-assets` to `crates/typst-compiler/Cargo.toml`. Verify they resolve and compile. Acceptance: `cargo build -p typst-compiler` succeeds; note any compilation warnings related to the Typst dependency tree.
- [x] 1.3 Add `wasm32-unknown-unknown` target and `build-wasm` recipe to the `justfile`. Acceptance: `rustup target add wasm32-unknown-unknown` confirmed installed; `just build-wasm` runs `cargo build --target wasm32-unknown-unknown -p typst-compiler` (even if it fails at this stage — we want to see the failure mode).

## 2. Data Model

- [x] 2.1 Define Rust structs for the minimal block model in `crates/typst-compiler/src/model.rs`: `BlockModel`, `Block` (enum: `Text`, `Repeating`, `Conditional`), `PortableTextDoc`, `PtBlock`, `PtChild` (enum: `Span`, `MergeField`), `PtMark` (enum: `Strong`, `Em`), `ConditionTree`. All must derive `serde::Deserialize`. Acceptance: structs compile cleanly; a hardcoded instance can be constructed in a test.
- [x] 2.2 Write a Rust unit test that constructs the hardcoded spike block model and payload in code (no JSON parsing needed yet). The model should contain: one Text block with a plain span, a bold span, and a merge field; one Repeating Section over `invoice.items` with a text block inside and an empty-state slot; one Conditional Section visible only when `invoice.status == "paid"`. Acceptance: test compiles and the model is inspectable via `{:?}`.

## 3. Block Model → Typst Compiler

- [x] 3.1 Implement `compile_pt_inline(child: &PtChild) -> String` in `crates/typst-compiler/src/compiler.rs`: plain span → text, strong span → `*text*`, em span → `_text_`, strong+em → `*_text_*`, merge field → `#data.field.path`. Return an error string for unknown node types. Acceptance: unit tests cover all mark combinations and the merge field case.
- [x] 3.2 Implement `compile_pt_block(block: &PtBlock) -> String`: walk children via `compile_pt_inline`, wrap in appropriate Typst paragraph or heading syntax based on `style` field (`h1` → `= ...`, `h2` → `== ...`, `normal` → plain paragraph). Acceptance: unit test round-trips a mixed PT block to the expected Typst string.
- [x] 3.3 Implement `compile_block(block: &Block) -> String` for the three block types: Text (delegates to PT compiler), Repeating Section (emits `#if ... for ... else`), Conditional Section (emits `#if condition [...]`). Acceptance: unit tests cover all three block types including the Repeating Section empty-state case.
- [x] 3.4 Implement `compile(model: &BlockModel) -> String`: hardcoded preamble (page setup, base text style) + `#let data = json("data.json")` + compiled blocks joined. Acceptance: calling `compile` on the spike model produces a non-empty Typst string that can be inspected in a test output.

## 4. Typst Renderer

- [x] 4.1 Implement a minimal `InMemoryWorld` struct in `crates/typst-compiler/src/renderer.rs` that satisfies Typst's `World` trait. It must serve: the Typst source string, `data.json` (the payload), and font/asset data from `typst-assets`. Acceptance: `InMemoryWorld::new(source, payload_json)` compiles without error.
- [x] 4.2 Implement `render(source: &str, payload: &serde_json::Value) -> Result<Vec<u8>, RenderError>` that constructs `InMemoryWorld`, calls `typst::compile`, exports via `typst_pdf::export`, and returns PDF bytes. Acceptance: calling `render` with the compiled spike template and hardcoded payload returns `Ok(bytes)` where `bytes.len() > 0`.
- [x] 4.3 Write an integration test in `crates/typst-compiler/tests/` that calls `compile` then `render` end-to-end with the spike model and payload. Save the output bytes to `/tmp/spike-output.pdf` so it can be opened and visually inspected. Acceptance: test passes; PDF opens and contains "Acme Corp", two line items, and the paid confirmation text.

## 5. API Endpoint

- [x] 5.1 Add `GET /api/render/test` to the Axum router in `apps/api`. The handler calls `typst_compiler::compile` then `typst_compiler::render` with the hardcoded spike model and payload, and returns the PDF bytes with `Content-Type: application/pdf`. Acceptance: `curl http://localhost:3000/api/render/test --output test.pdf` produces a valid PDF.

## 6. Wasm Verification

- [x] 6.1 Run `just build-wasm`. Record the result (success or specific error) and the uncompressed `.wasm` binary size if successful. Document findings in `crates/typst-compiler/docs/wasm-findings.md`. Acceptance: findings documented; if build fails, root cause identified and next steps noted.
- [x] 6.2 If Wasm build fails due to `typst` dependency constraints, investigate feature flags or alternative approaches (e.g. `wasm-pack`, conditional compilation). Document the investigation outcome. Acceptance: either Wasm build passes, or a concrete recommendation for resolving the blocker is documented.
