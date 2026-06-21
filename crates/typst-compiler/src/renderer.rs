use std::collections::HashMap;

use chrono::{Datelike, Local};
use typst::{
    diag::{FileError, FileResult},
    foundations::Bytes,
    layout::PagedDocument,
    syntax::{FileId, Source, VirtualPath},
    text::{Font, FontBook},
    utils::LazyHash,
    Library, LibraryExt, World,
};
use typst_pdf::PdfOptions;

#[derive(Debug, thiserror::Error)]
pub enum RenderError {
    #[error("Compilation error: {0}")]
    Compile(String),
    #[error("PDF export error: {0}")]
    Export(String),
}

pub fn render(source: &str, payload: &serde_json::Value) -> Result<Vec<u8>, RenderError> {
    render_with_fonts(source, payload, &[])
}

pub fn render_svg(source: &str, payload: &serde_json::Value) -> Result<Vec<String>, RenderError> {
    render_svg_with_fonts(source, payload, &[])
}

pub fn render_svg_with_fonts(
    source: &str,
    payload: &serde_json::Value,
    extra_fonts: &[Vec<u8>],
) -> Result<Vec<String>, RenderError> {
    let payload_json = serde_json::to_string(payload)
        .map_err(|e| RenderError::Compile(e.to_string()))?;

    let world = InMemoryWorld::new(source, &payload_json, extra_fonts);

    let result = typst::compile::<PagedDocument>(&world);
    let document = result.output.map_err(|errs| {
        let msgs: Vec<_> = errs.iter().map(|e| format!("{}", e.message)).collect();
        RenderError::Compile(msgs.join("; "))
    })?;

    let pages: Vec<String> = document.pages.iter().map(typst_svg::svg).collect();
    Ok(pages)
}

/// On-page bounding box of a field-intent's labelled merge field, in the same
/// pt units as the SVG's `viewBox`/`width`/`height` (see `typst-svg`'s header
/// writer), so the frontend can place an overlay box with simple ratio math
/// and no unit conversion. `(x_pt, y_pt)` is the top-left corner; `w_pt`/`h_pt`
/// come from Typst's `measure()` of the same content, so they're only exact
/// for single-line values — a value that wraps in the real layout will report
/// a wider/shorter box than what's actually rendered.
#[derive(Debug, Clone, serde::Serialize)]
pub struct FieldIntentPosition {
    pub key: String,
    /// 1-based, matching Typst's own page numbering.
    pub page: usize,
    pub x_pt: f64,
    pub y_pt: f64,
    pub w_pt: f64,
    pub h_pt: f64,
}

/// Same as `render_svg_with_fonts`, but also returns the on-page position of
/// every labelled field intent (`<fi-N>`) found via Typst's introspector.
pub fn render_svg_with_fonts_and_positions(
    source: &str,
    payload: &serde_json::Value,
    extra_fonts: &[Vec<u8>],
) -> Result<(Vec<String>, Vec<FieldIntentPosition>), RenderError> {
    let payload_json = serde_json::to_string(payload)
        .map_err(|e| RenderError::Compile(e.to_string()))?;

    let world = InMemoryWorld::new(source, &payload_json, extra_fonts);

    let result = typst::compile::<PagedDocument>(&world);
    let document = result.output.map_err(|errs| {
        let msgs: Vec<_> = errs.iter().map(|e| format!("{}", e.message)).collect();
        RenderError::Compile(msgs.join("; "))
    })?;

    let pages: Vec<String> = document.pages.iter().map(typst_svg::svg).collect();
    let positions = extract_field_intent_positions(&document);
    Ok((pages, positions))
}

/// Position and size for a field intent are tracked via two independent
/// mechanisms (see `compiler::compile_pt_inline`):
/// - Size: a `metadata((key, w, h))` mark, found by element type (no label
///   needed, since `MetadataElem` is natively `Locatable`) and matched back
///   to its field by the `key` stored in its own value.
/// - Position: a plain `<key>` label directly on the visible content block,
///   resolved to an on-page anchor via the introspector.
fn extract_field_intent_positions(document: &PagedDocument) -> Vec<FieldIntentPosition> {
    use typst::foundations::{Dict, Label, NativeElement, Selector};
    use typst::introspection::MetadataElem;

    let introspector = &document.introspector;

    introspector
        .query(&MetadataElem::ELEM.select())
        .iter()
        .filter_map(|content| {
            let metadata = content.to_packed::<MetadataElem>()?;
            let dict: Dict = metadata.value.clone().cast().ok()?;
            let key: String = dict.get("key").ok()?.clone().cast().ok()?;
            let w_pt: f64 = dict.get("w").ok()?.clone().cast().ok()?;
            let h_pt: f64 = dict.get("h").ok()?.clone().cast().ok()?;

            let label = Label::construct(key.clone().into()).ok()?;
            let labelled = introspector.query_first(&Selector::Label(label))?;
            let location = labelled.location()?;
            let pos = introspector.position(location);

            // Empirically, the introspector's point for a labelled inline
            // content block is its BOTTOM-left corner (confirmed by labelling
            // content with nothing preceding it on the line and observing
            // `y == top margin + h_pt`, not `y == top margin`). Subtract the
            // measured height so callers get a true top-left + size box.
            Some(FieldIntentPosition {
                key,
                page: pos.page.get(),
                x_pt: pos.point.x.to_pt(),
                y_pt: pos.point.y.to_pt() - h_pt,
                w_pt,
                h_pt,
            })
        })
        .collect()
}

pub fn render_with_fonts(
    source: &str,
    payload: &serde_json::Value,
    extra_fonts: &[Vec<u8>],
) -> Result<Vec<u8>, RenderError> {
    let payload_json = serde_json::to_string(payload)
        .map_err(|e| RenderError::Compile(e.to_string()))?;

    let world = InMemoryWorld::new(source, &payload_json, extra_fonts);

    let result = typst::compile::<PagedDocument>(&world);
    let document = result.output.map_err(|errs| {
        let msgs: Vec<_> = errs.iter().map(|e| format!("{}", e.message)).collect();
        RenderError::Compile(msgs.join("; "))
    })?;

    let pdf_bytes = typst_pdf::pdf(&document, &PdfOptions::default()).map_err(|errs| {
        let msgs: Vec<_> = errs.iter().map(|e| format!("{}", e.message)).collect();
        RenderError::Export(msgs.join("; "))
    })?;

    Ok(pdf_bytes)
}

// ── InMemoryWorld ─────────────────────────────────────────────────────────────

struct InMemoryWorld {
    library: LazyHash<Library>,
    book: LazyHash<FontBook>,
    fonts: Vec<Font>,
    main_id: FileId,
    files: HashMap<FileId, Bytes>,
}

impl InMemoryWorld {
    fn new(source: &str, payload_json: &str, extra_fonts: &[Vec<u8>]) -> Self {
        let main_id = FileId::new(None, VirtualPath::new("/main.typ"));
        let data_id = FileId::new(None, VirtualPath::new("/data.json"));

        let mut files = HashMap::new();
        files.insert(main_id, Bytes::new(source.as_bytes().to_vec()));
        files.insert(data_id, Bytes::new(payload_json.as_bytes().to_vec()));

        let mut book = FontBook::new();
        let mut fonts = Vec::new();
        for data in typst_assets::fonts() {
            let font_bytes = Bytes::new(data.to_vec());
            for font in Font::iter(font_bytes) {
                book.push(font.info().clone());
                fonts.push(font);
            }
        }
        for data in extra_fonts {
            let font_bytes = Bytes::new(data.clone());
            for font in Font::iter(font_bytes) {
                book.push(font.info().clone());
                fonts.push(font);
            }
        }

        Self {
            library: LazyHash::new(Library::default()),
            book: LazyHash::new(book),
            fonts,
            main_id,
            files,
        }
    }
}

impl World for InMemoryWorld {
    fn library(&self) -> &LazyHash<Library> {
        &self.library
    }

    fn book(&self) -> &LazyHash<FontBook> {
        &self.book
    }

    fn main(&self) -> FileId {
        self.main_id
    }

    fn source(&self, id: FileId) -> FileResult<Source> {
        self.files
            .get(&id)
            .ok_or_else(|| FileError::NotFound(id.vpath().as_rootless_path().into()))
            .and_then(|bytes| {
                let text = std::str::from_utf8(bytes)
                    .map_err(|_| FileError::InvalidUtf8)?
                    .to_owned();
                Ok(Source::new(id, text))
            })
    }

    fn file(&self, id: FileId) -> FileResult<Bytes> {
        self.files
            .get(&id)
            .cloned()
            .ok_or_else(|| FileError::NotFound(id.vpath().as_rootless_path().into()))
    }

    fn font(&self, index: usize) -> Option<Font> {
        self.fonts.get(index).cloned()
    }

    fn today(&self, offset: Option<i64>) -> Option<typst::foundations::Datetime> {
        let now = Local::now();
        let offset_secs = offset.unwrap_or(0) * 3600;
        let adjusted = now + chrono::Duration::seconds(offset_secs);
        typst::foundations::Datetime::from_ymd(
            adjusted.year(),
            adjusted.month() as u8,
            adjusted.day() as u8,
        )
    }
}
