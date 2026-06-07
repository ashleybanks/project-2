# Wasm Build Findings — typst-render-spike

**Date:** 2026-06-07
**Target:** `wasm32-unknown-unknown`
**Command:** `cargo build --target wasm32-unknown-unknown -p typst-compiler`

## Result: SUCCESS

The `typst-compiler` crate compiles to `wasm32-unknown-unknown` without modification.
No Axum, Tokio, or filesystem dependencies are in the compiler crate — only
`typst`, `typst-pdf`, `typst-assets`, `serde`, `serde_json`, `thiserror`, and `chrono`.

## Artefact

`target/wasm32-unknown-unknown/debug/libtypst_compiler.rlib` — **9.8 MB** (debug)

This is an rlib (Rust archive), not a `.wasm` binary. The crate is currently
`crate-type = ["lib"]`. To produce a `.wasm` binary for use in the browser:

1. Add `crate-type = ["cdylib"]` to `Cargo.toml`
2. Add `wasm-bindgen` and annotate public API with `#[wasm_bindgen]`
3. Build with `wasm-pack build --target web`

That work is deferred to the browser preview change (Phase 1, after the template
builder). This spike confirms the prerequisite: the compiler crate **can** be
compiled to Wasm.

## Estimated production binary size

Debug rlib: 9.8 MB. Expectations for a release `.wasm`:
- `cargo build --release --target wasm32-unknown-unknown` + `wasm-opt -Oz`
  typically reduces Typst-based Wasm binaries to the 3–8 MB range (uncompressed).
- With Brotli compression (standard for Wasm over HTTP): likely 1–3 MB.
- This is within acceptable range for a preview widget. Monitor at wasm-bindgen stage.

## No blockers

The Wasm compilation path is clear. The in-memory `InMemoryWorld` implementation
(no disk I/O) is Wasm-compatible by design — file reads are served from a
`HashMap` in memory, matching the Wasm constraint of no filesystem access.
