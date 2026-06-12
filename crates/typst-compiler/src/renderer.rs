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
