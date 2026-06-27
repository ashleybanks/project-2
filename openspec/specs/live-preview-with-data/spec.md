---
capability: live-preview-with-data
status: done
---

# Live Preview with Data

## Purpose

The in-browser preview now renders SVG (not PDF) using `render_preview_svg` / `render_preview_with_data_svg`. See `svg-preview` spec for the rendering surface and `preview-record-navigation` spec for record selection.

The `render_preview_with_data` PDF export is retained for **server-side generation only** and is unchanged. The frontend no longer calls it.

## Removed

The following capabilities were removed as part of the template-nav-restructure change:

- **Data selector in preview toolbar** — The `DataSelector` component (No data / Test record N / Custom JSON) is removed. Data context in Preview now comes exclusively from the active job's record set, navigated via the record navigator in the Preview toolbar.
- **Download preview button** — The "Download preview" button (which downloaded WASM-rendered PDF bytes) is removed. The WASM preview now renders SVG. Server-side PDFs are available for download per item from the Data tab once generated.
- **WASM export `render_preview_with_data` (browser use)** — The PDF-based export is superseded by `render_preview_with_data_svg` for in-browser preview. The server-side render path continues to use the PDF exports unchanged.
