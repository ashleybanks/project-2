## Context

The render pipeline is the most architecturally significant unproven component. Every other Phase 1 feature (visual builder, schema inference, merge API) produces output that eventually flows through this pipeline. If the `typst` and `typst-pdf` crates have integration issues, Wasm compilation problems, or produce incorrect output, the entire rendering approach would need to change.

The spike isolates this risk by proving the pipeline with hardcoded inputs before any other work depends on it. It also establishes the workspace structure for the compiler crate — shared between the server and the future Wasm build — that all subsequent work will build on.

## Goals / Non-Goals

**Goals:**
- Prove `typst` + `typst-pdf` crates compile and link cleanly in the Axum workspace
- Implement a minimal block model → Typst source compiler covering Text (with Portable Text content), Repeating Section, and Conditional Section
- Implement in-process PDF rendering (Typst source + payload JSON → PDF bytes) using Typst's virtual file system
- Expose `GET /api/render/test` returning a rendered PDF
- Verify the compiler crate builds to Wasm (`wasm32-unknown-unknown` target) without modification
- Establish the two-pass compile structure (stylesheet rules + block content) that production will use

**Non-Goals:**
- Full block type coverage (Table, Image, Pin blocks deferred)
- Stylesheet system (hardcoded Typst style rules for the spike)
- Database integration (hardcoded block model and payload)
- Async job model (synchronous for this spike)
- Error recovery or user-facing error messages

## Decisions

### 1. Separate `crates/typst-compiler` workspace member

The block model → Typst compiler and the Typst renderer are extracted into their own crate (`crates/typst-compiler`) rather than living inside `apps/api`. This crate is the unit that will be compiled to Wasm for the browser preview.

```
project-2/
  apps/
    api/          # Axum server — depends on typst-compiler
    web/          # React frontend
  crates/
    typst-compiler/   # Block model compiler + Typst renderer
                      # No Axum dependency — pure data-in, bytes-out
  Cargo.toml     # workspace
```

`apps/api` depends on `crates/typst-compiler`. The compiler crate has no web framework dependency, which is required for Wasm compilation (`axum` does not compile to `wasm32-unknown-unknown`).

### 2. Typst virtual file system for in-process rendering

Typst's rendering API requires a `World` implementation that provides file access. Rather than writing payload data to disk, we implement a minimal in-memory `World` that serves:
- The Typst source string (the compiled template)
- The payload JSON as `data.json` (read by `#let data = json("data.json")` in the template)
- Typst's standard library (from the `typst-assets` crate)

This keeps rendering fully in-process with no temp file I/O — consistent with the Wasm path (where file I/O is unavailable).

### 3. Two-pass Typst source generation

The compiler generates Typst source in two sections:

```rust
fn compile(block_model: &BlockModel, payload: &Value) -> String {
    let preamble = compile_preamble(); // hardcoded style rules for spike
    let content  = compile_blocks(&block_model.blocks);
    format!("#let data = json(\"data.json\")\n\n{preamble}\n\n{content}")
}
```

The `data.json` reference in the preamble is how Typst consumes the payload at render time. This structure is the same one production will use — the spike just hardcodes the preamble rather than compiling it from a stylesheet.

### 4. Portable Text → Typst inline compilation

Text blocks store content as Portable Text. The compiler walks the PT node tree:

```
PT node                         →   Typst
────────────────────────────────────────────────────
span (no marks)                 →   plain text
span + "strong" mark            →   *text*
span + "em" mark                →   _text_
span + "strong" + "em"          →   *_text_*
mergeField { field: "a.b" }     →   #data.a.b
block (style: "normal")         →   paragraph
block (style: "h1")             →   = content
```

### 5. Wasm target verification

The spike verifies Wasm compatibility by adding a `wasm32-unknown-unknown` target build to the `just build-wasm` target in the `justfile`. A successful `cargo build --target wasm32-unknown-unknown` for `crates/typst-compiler` is the acceptance criterion — we are not building a full browser integration in this spike.

## Risks / Trade-offs

**[Risk] Typst crates have heavy dependencies that inflate Wasm binary size** → Mitigation: measure binary size as part of the spike. If >15MB uncompressed, investigate `wasm-opt` and feature flags before committing to the Wasm preview approach.

**[Risk] Typst's `World` trait API changes between versions** → Mitigation: pin the Typst crate version. The `World` implementation is isolated to `crates/typst-compiler` — one place to update.

**[Risk] Portable Text node types expand significantly beyond the spike subset** → Mitigation: the compiler returns an error for unrecognised node types rather than silently dropping them. Unknown nodes surface early.

**[Trade-off] Synchronous rendering in the spike** → The `GET /api/render/test` endpoint is synchronous for simplicity. Production will use the async job model. The compiler itself is synchronous (no async needed); the async wrapper is an Axum concern, not a compiler concern.

## Open Questions

1. **Typst standard library packaging** — does `typst-assets` provide everything needed, or do we need to bundle additional font/asset files? Verify during task 1.
2. **Wasm binary size** — measure and document. Informs whether the in-browser preview approach is viable as-is or needs optimisation.
3. **Font embedding** — PDFs need embedded fonts. Confirm the default Typst font (Libertinus) is available via `typst-assets` and renders correctly without external font installation.
