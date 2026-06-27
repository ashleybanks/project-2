## REMOVED Requirements

### Requirement: Data selector in preview toolbar
**Reason:** Replaced by the active job record navigator. The DataSelector component (No data / Test record N / Custom JSON) is removed. Data context in Preview now comes exclusively from the active job's record set.
**Migration:** Users who previously used test data to preview will load a JSON array (which may include test records) as a draft job via the Data tab. Test data generation remains available on the Design → Schema sub-tab.

### Requirement: Download preview button
**Reason:** The "Download preview" button (which downloaded the WASM-rendered PDF bytes) is removed. The WASM preview now renders SVG, not PDF. Server-side PDFs are available for download per item from the Data tab once generated.
**Migration:** Users download generated PDFs from the Data tab after submitting a job item for rendering.

### Requirement: WASM export `render_preview_with_data`
**Reason:** The PDF-based `render_preview_with_data` export is superseded by `render_preview_with_data_svg` for in-browser preview. The PDF export is retained for server-side generation only.
**Migration:** The frontend no longer calls `render_preview_with_data`; it calls `render_preview_with_data_svg` instead. The server-side render path continues to use the PDF exports unchanged.
