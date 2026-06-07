## Why

The entire product's value depends on a working block model → Typst → PDF chain, but this has never been run. Before any visual builder, schema inference, or merge API work begins, we need to prove that the `typst` and `typst-pdf` Rust crates compile, integrate cleanly with Axum, produce correct PDF output, and that the same code builds to Wasm for the in-browser preview path.

## What Changes

- Add `typst` and `typst-pdf` crates to `apps/api`
- Define Rust data structures for the block model (a minimal subset: Text block with Portable Text content, Repeating Section, Conditional Section)
- Implement a block model → Typst source compiler in Rust covering that subset
- Implement the Typst render path: Typst source + payload JSON → PDF bytes (in-process, no subprocess)
- Expose a `GET /api/render/test` endpoint that returns a PDF rendered from a hardcoded block model and payload
- Verify the block model → Typst compiler builds to Wasm without modification
- Add a `typst-compiler` crate within the workspace to house the compiler and renderer, shared between the server and future Wasm build

## Capabilities

### New Capabilities

- `pdf-rendering`: The system can compile a block model and a data payload into a PDF document, in-process, via the Typst Rust crates

### Modified Capabilities

_(none)_

## Impact

- **Dependencies**: `typst`, `typst-pdf` crates added to `apps/api`; new `crates/typst-compiler` workspace member
- **Backend**: New `/api/render/test` endpoint; new compiler module in the workspace
- **Wasm**: Compiler crate must build to Wasm — verified as part of this spike
- **No database changes**: Hardcoded block model and payload; no template storage involved
- **No frontend changes**: PDF returned as bytes from the API endpoint

## Non-goals

- Visual builder UI
- File upload or template import
- Schema inference or payload validation
- Database storage of templates
- The full range of block types (Table, Image, Pin blocks deferred)
- Production-grade error handling in the compiler
- Stylesheet support (hardcoded Typst style rules for the spike)

## Phase

Phase 1 — prerequisite spike. Must be completed before the template builder or merge API work begins.
