use quick_xml::{events::Event, Reader};
use serde_json::{json, Value};
use std::io::Cursor;
use zip::ZipArchive;

/// Parse a DOCX byte slice into a Portable Text block model.
pub fn parse_docx(data: &[u8]) -> Result<Value, String> {
    let cursor = Cursor::new(data);
    let mut archive = ZipArchive::new(cursor)
        .map_err(|e| format!("Not a valid ZIP/DOCX: {e}"))?;

    // Validate it's a DOCX by checking [Content_Types].xml
    archive
        .by_name("[Content_Types].xml")
        .map_err(|_| "Missing [Content_Types].xml — not a DOCX file".to_string())?;

    let xml = {
        let mut entry = archive
            .by_name("word/document.xml")
            .map_err(|_| "Missing word/document.xml".to_string())?;
        let mut buf = Vec::new();
        std::io::Read::read_to_end(&mut entry, &mut buf)
            .map_err(|e| format!("Failed to read document.xml: {e}"))?;
        buf
    };

    let blocks = parse_document_xml(&xml)?;
    Ok(json!({ "blocks": blocks }))
}

fn parse_document_xml(xml: &[u8]) -> Result<Vec<Value>, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(true);

    let mut blocks: Vec<Value> = Vec::new();

    // Parser state
    let mut in_paragraph = false;
    let mut in_run = false;
    let mut in_table = false;
    let mut in_del = false; // tracked deletion — skip text

    // Current paragraph state
    let mut para_style: Option<String> = None;
    let mut current_spans: Vec<Value> = Vec::new();

    // Current run state
    let mut run_text = String::new();
    let mut run_bold = false;
    let mut run_italic = false;
    let mut run_underline = false;
    let mut run_strike = false;

    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e) | Event::Empty(e)) => {
                let raw = e.name();
                let name = local_name(raw.as_ref());
                match name {
                    "p" => {
                        in_paragraph = true;
                        para_style = None;
                        current_spans = Vec::new();
                    }
                    "r" if in_paragraph && !in_del => {
                        in_run = true;
                        run_text.clear();
                        run_bold = false;
                        run_italic = false;
                        run_underline = false;
                        run_strike = false;
                    }
                    // Run properties
                    "b" if in_run => run_bold = true,
                    "i" if in_run => run_italic = true,
                    "u" if in_run => run_underline = true,
                    "strike" if in_run => run_strike = true,
                    // Paragraph style
                    "pStyle" if in_paragraph => {
                        if let Some(val) = attr_value(&e, b"w:val")
                            .or_else(|| attr_value(&e, b"val"))
                        {
                            para_style = Some(val);
                        }
                    }
                    // Tables
                    "tbl" => in_table = true,
                    "tc" if in_table => { /* cell boundary — content extracted as flat blocks */ }
                    // Tracked deletions — skip their text
                    "del" => in_del = true,
                    // Images — insert placeholder
                    "drawing" | "pict" if in_paragraph => {
                        current_spans.push(json!({
                            "_type": "span",
                            "_key": new_key(),
                            "text": "[Image]",
                            "marks": []
                        }));
                    }
                    // Hyperlinks — we extract inner text as normal spans (href lost)
                    _ => {}
                }
            }
            Ok(Event::End(e)) => {
                let raw_end = e.name();
                let name = local_name(raw_end.as_ref());
                match name {
                    "r" if in_run => {
                        in_run = false;
                        if !run_text.is_empty() {
                            let mut marks: Vec<Value> = Vec::new();
                            if run_bold { marks.push(json!("strong")); }
                            if run_italic { marks.push(json!("em")); }
                            if run_underline { marks.push(json!("underline")); }
                            if run_strike { marks.push(json!("strike")); }
                            current_spans.push(json!({
                                "_type": "span",
                                "_key": new_key(),
                                "text": run_text.clone(),
                                "marks": marks
                            }));
                        }
                        run_text.clear();
                    }
                    "p" if in_paragraph => {
                        in_paragraph = false;
                        if !current_spans.is_empty() || para_style.is_some() {
                            let style = map_para_style(para_style.as_deref());
                            blocks.push(json!({
                                "type": "text",
                                "style_class": "body",
                                "content": [{
                                    "_type": "block",
                                    "_key": new_key(),
                                    "style": style,
                                    "children": current_spans
                                }]
                            }));
                        }
                    }
                    "tc" => {}
                    "tbl" => in_table = false,
                    "del" => in_del = false,
                    _ => {}
                }
            }
            Ok(Event::Text(e)) if in_run && !in_del => {
                if let Ok(text) = e.unescape() {
                    run_text.push_str(&text);
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(format!("XML parse error: {e}")),
            _ => {}
        }
        buf.clear();
    }

    Ok(blocks)
}

fn local_name(name: &[u8]) -> &str {
    // Strip namespace prefix (e.g. "w:p" → "p")
    let s = std::str::from_utf8(name).unwrap_or("");
    s.rsplit(':').next().unwrap_or(s)
}

fn attr_value(e: &quick_xml::events::BytesStart, key: &[u8]) -> Option<String> {
    e.attributes()
        .filter_map(|a| a.ok())
        .find(|a| a.key.as_ref() == key)
        .and_then(|a| String::from_utf8(a.value.to_vec()).ok())
}

fn map_para_style(style: Option<&str>) -> &'static str {
    match style {
        Some(s) if s.eq_ignore_ascii_case("Heading1") || s == "1" => "h1",
        Some(s) if s.eq_ignore_ascii_case("Heading2") || s == "2" => "h2",
        Some(s) if s.eq_ignore_ascii_case("Heading3") || s == "3" => "h3",
        _ => "normal",
    }
}

fn new_key() -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(1);
    format!("k{}", COUNTER.fetch_add(1, Ordering::Relaxed))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_docx(document_xml: &str) -> Vec<u8> {
        use std::io::Write;
        let buf = Vec::new();
        let cursor = Cursor::new(buf);
        let mut zip = zip::ZipWriter::new(cursor);

        let opts = zip::write::SimpleFileOptions::default();

        zip.start_file("[Content_Types].xml", opts).unwrap();
        zip.write_all(br#"<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>"#).unwrap();

        zip.start_file("word/document.xml", opts).unwrap();
        zip.write_all(document_xml.as_bytes()).unwrap();

        zip.finish().unwrap().into_inner()
    }

    #[test]
    fn parses_plain_paragraph() {
        let xml = r#"<?xml version="1.0"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Hello world</w:t></w:r></w:p>
  </w:body>
</w:document>"#;
        let docx = make_docx(xml);
        let result = parse_docx(&docx).unwrap();
        let blocks = result["blocks"].as_array().unwrap();
        assert_eq!(blocks.len(), 1);
        let children = &blocks[0]["content"][0]["children"];
        assert_eq!(children[0]["text"], "Hello world");
    }

    #[test]
    fn parses_bold_italic() {
        let xml = r#"<?xml version="1.0"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r><w:rPr><w:b/><w:i/></w:rPr><w:t>Bold italic</w:t></w:r>
    </w:p>
  </w:body>
</w:document>"#;
        let docx = make_docx(xml);
        let result = parse_docx(&docx).unwrap();
        let children = &result["blocks"][0]["content"][0]["children"];
        let marks = children[0]["marks"].as_array().unwrap();
        assert!(marks.iter().any(|m| m == "strong"), "missing strong");
        assert!(marks.iter().any(|m| m == "em"), "missing em");
    }

    #[test]
    fn parses_heading() {
        let xml = r#"<?xml version="1.0"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
      <w:r><w:t>My Heading</w:t></w:r>
    </w:p>
  </w:body>
</w:document>"#;
        let docx = make_docx(xml);
        let result = parse_docx(&docx).unwrap();
        let style = &result["blocks"][0]["content"][0]["style"];
        assert_eq!(style, "h1");
    }

    #[test]
    fn rejects_non_docx() {
        let result = parse_docx(b"this is not a zip file");
        assert!(result.is_err());
    }
}
