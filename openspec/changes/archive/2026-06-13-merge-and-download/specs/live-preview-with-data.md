---
capability: live-preview-with-data
status: done
---

# Live Preview with Data

## WASM export

A second export `render_preview_with_data` is added to the `typst-compiler` crate:

```rust
pub fn render_preview_with_data(
    blocks_json: &str,
    stylesheet_json: &str,
    data_json: &str,   // JSON-serialised payload; pass "{}" for empty
    font_data: &Array,
) -> Result<Vec<u8>, JsValue>
```

The existing `render_preview` (which passes `{}` internally) is kept unchanged for backwards compatibility.

## Data selector (preview mode)

When the user is in Preview mode, a data selector is shown above the PDF iframe.

**Options:**
- **No data** (default) — renders with `{}`; shows template structure without values
- **Test record N** — one entry per record returned by `GET /schema/test-data`; uses that record as the payload
- **Custom JSON** — shows a compact textarea; user pastes or types a JSON object; an "Apply" button triggers re-render

Switching selection triggers a new WASM render (same 400ms debounce path as block/stylesheet changes).

## Download preview

A "Download preview" button in the preview toolbar streams the current PDF bytes as a browser download (`Blob` → `<a download>`). No server request. The filename is `preview.pdf`.

This button is always visible in preview mode (disabled while the render is in progress).

## Data selector state

The selected data mode is local UI state, not persisted. It resets to "No data" on page reload.
