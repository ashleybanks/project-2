use quick_xml::{events::Event, Reader};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::Cursor;
use zip::ZipArchive;

#[derive(Clone, Copy)]
enum ListKind {
    Bullet,
    Ordered,
}

pub fn parse_docx(data: &[u8]) -> Result<Value, String> {
    let cursor = Cursor::new(data);
    let mut archive = ZipArchive::new(cursor)
        .map_err(|e| format!("Not a valid ZIP/DOCX: {e}"))?;

    archive
        .by_name("[Content_Types].xml")
        .map_err(|_| "Missing [Content_Types].xml — not a DOCX file".to_string())?;

    let numbering_xml = read_zip_entry(&mut archive, "word/numbering.xml").ok();
    let num_kinds: HashMap<u32, ListKind> = numbering_xml
        .as_deref()
        .map(parse_numbering_xml)
        .unwrap_or_default();

    let xml = read_zip_entry(&mut archive, "word/document.xml")
        .map_err(|e| e)?;

    let pt_blocks = parse_document_xml(&xml, &num_kinds)?;
    let section = json!({
        "_type": "section",
        "_key": new_key(),
        "content": pt_blocks
    });
    Ok(json!({ "blocks": [section] }))
}

fn read_zip_entry<R: std::io::Read + std::io::Seek>(
    archive: &mut ZipArchive<R>,
    name: &str,
) -> Result<Vec<u8>, String> {
    let mut entry = archive
        .by_name(name)
        .map_err(|_| format!("Missing {name}"))?;
    let mut buf = Vec::new();
    std::io::Read::read_to_end(&mut entry, &mut buf)
        .map_err(|e| format!("Failed to read {name}: {e}"))?;
    Ok(buf)
}

fn parse_numbering_xml(xml: &[u8]) -> HashMap<u32, ListKind> {
    let mut abstract_kinds: HashMap<u32, ListKind> = HashMap::new();
    let mut num_to_abstract: HashMap<u32, u32> = HashMap::new();

    let mut reader = Reader::from_reader(xml);
    let mut buf = Vec::new();
    let mut cur_abstract: Option<u32> = None;
    let mut cur_num: Option<u32> = None;
    let mut in_level0 = false;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e) | Event::Empty(e)) => {
                let raw = e.name();
                let name = local_name(raw.as_ref());
                match name {
                    "abstractNum" => {
                        cur_abstract = attr_value(&e, b"w:abstractNumId")
                            .and_then(|s| s.parse().ok());
                        in_level0 = false;
                    }
                    "num" => {
                        cur_num = attr_value(&e, b"w:numId")
                            .and_then(|s| s.parse().ok());
                    }
                    "abstractNumId" if cur_num.is_some() => {
                        if let (Some(nid), Some(aid)) = (
                            cur_num,
                            attr_value(&e, b"w:val").and_then(|s| s.parse::<u32>().ok()),
                        ) {
                            num_to_abstract.insert(nid, aid);
                        }
                    }
                    "lvl" if cur_abstract.is_some() => {
                        in_level0 = attr_value(&e, b"w:ilvl")
                            .and_then(|s| s.parse::<u32>().ok())
                            == Some(0);
                    }
                    "numFmt" if in_level0 => {
                        if let Some(aid) = cur_abstract {
                            if !abstract_kinds.contains_key(&aid) {
                                let kind =
                                    if attr_value(&e, b"w:val").as_deref() == Some("bullet") {
                                        ListKind::Bullet
                                    } else {
                                        ListKind::Ordered
                                    };
                                abstract_kinds.insert(aid, kind);
                            }
                        }
                    }
                    _ => {}
                }
            }
            Ok(Event::End(e)) => {
                let raw_end = e.name();
                match local_name(raw_end.as_ref()) {
                "abstractNum" => {
                    cur_abstract = None;
                    in_level0 = false;
                }
                "num" => cur_num = None,
                "lvl" => in_level0 = false,
                _ => {}
                }
            }
            Ok(Event::Eof) => break,
            _ => {}
        }
        buf.clear();
    }

    num_to_abstract
        .into_iter()
        .filter_map(|(nid, aid)| abstract_kinds.get(&aid).map(|&k| (nid, k)))
        .collect()
}

// ── Table parsing state ──────────────────────────────────────────────────────

struct CellState {
    content: Vec<Value>,
    is_header: bool,
}

struct TableState {
    rows: Vec<Value>,
    cur_cells: Vec<CellState>,
    header_first_row: bool,
    cur_row_is_header: bool,
    opened_rows: usize,
}

impl TableState {
    fn new() -> Self {
        TableState {
            rows: Vec::new(),
            cur_cells: Vec::new(),
            header_first_row: false,
            cur_row_is_header: false,
            opened_rows: 0,
        }
    }
}

fn push_block(block: Value, blocks: &mut Vec<Value>, table_stack: &mut Vec<TableState>) {
    if let Some(ts) = table_stack.last_mut() {
        if let Some(cell) = ts.cur_cells.last_mut() {
            cell.content.push(block);
        }
    } else {
        blocks.push(block);
    }
}

// ── Document parser ──────────────────────────────────────────────────────────

fn parse_document_xml(
    xml: &[u8],
    num_kinds: &HashMap<u32, ListKind>,
) -> Result<Vec<Value>, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(true);

    let mut blocks: Vec<Value> = Vec::new();
    let mut table_stack: Vec<TableState> = Vec::new();

    let mut in_paragraph = false;
    let mut in_run = false;
    let mut in_del = false;
    let mut in_num_pr = false;

    let mut para_style: Option<String> = None;
    let mut para_align: Option<String> = None;
    let mut para_list_numid: Option<u32> = None;
    let mut para_list_ilvl: u32 = 0;
    let mut current_spans: Vec<Value> = Vec::new();

    let mut run_text = String::new();
    let mut run_bold = false;
    let mut run_italic = false;
    let mut run_underline = false;
    let mut run_strike = false;
    let mut run_sub = false;
    let mut run_sup = false;

    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e) | Event::Empty(e)) => {
                let raw = e.name();
                let name = local_name(raw.as_ref());
                match name {
                    "p" => {
                        in_paragraph = true;
                        in_num_pr = false;
                        para_style = None;
                        para_align = None;
                        para_list_numid = None;
                        para_list_ilvl = 0;
                        current_spans = Vec::new();
                    }
                    "r" if in_paragraph && !in_del => {
                        in_run = true;
                        run_text.clear();
                        run_bold = false;
                        run_italic = false;
                        run_underline = false;
                        run_strike = false;
                        run_sub = false;
                        run_sup = false;
                    }
                    // Run formatting
                    "b" if in_run => {
                        run_bold = attr_value(&e, b"w:val").map_or(true, |v| v != "0");
                    }
                    "i" if in_run => {
                        run_italic = attr_value(&e, b"w:val").map_or(true, |v| v != "0");
                    }
                    "u" if in_run => {
                        run_underline = attr_value(&e, b"w:val").as_deref() != Some("none");
                    }
                    "strike" if in_run => {
                        run_strike = attr_value(&e, b"w:val").map_or(true, |v| v != "0");
                    }
                    "vertAlign" if in_run => match attr_value(&e, b"w:val").as_deref() {
                        Some("subscript") => run_sub = true,
                        Some("superscript") => run_sup = true,
                        _ => {}
                    },
                    // Paragraph style
                    "pStyle" if in_paragraph => {
                        if let Some(val) = attr_value(&e, b"w:val")
                            .or_else(|| attr_value(&e, b"val"))
                        {
                            para_style = Some(val);
                        }
                    }
                    // Paragraph alignment (only in pPr, not tcPr)
                    "jc" if in_paragraph && !in_run => {
                        para_align = attr_value(&e, b"w:val")
                            .and_then(|v| map_alignment(&v));
                    }
                    // List numbering
                    "numPr" if in_paragraph => {
                        in_num_pr = true;
                    }
                    "numId" if in_num_pr => {
                        para_list_numid = attr_value(&e, b"w:val")
                            .and_then(|s| s.parse::<u32>().ok())
                            .filter(|&n| n != 0);
                    }
                    "ilvl" if in_num_pr => {
                        para_list_ilvl = attr_value(&e, b"w:val")
                            .and_then(|s| s.parse::<u32>().ok())
                            .unwrap_or(0);
                    }
                    // Tables
                    "tbl" => {
                        table_stack.push(TableState::new());
                    }
                    "tblLook" if !table_stack.is_empty() => {
                        if let Some(ts) = table_stack.last_mut() {
                            let first_row = attr_value(&e, b"w:firstRow")
                                .or_else(|| attr_value(&e, b"firstRow"));
                            if first_row.as_deref() == Some("1") {
                                ts.header_first_row = true;
                            }
                        }
                    }
                    "tr" if !table_stack.is_empty() => {
                        if let Some(ts) = table_stack.last_mut() {
                            ts.cur_row_is_header =
                                ts.header_first_row && ts.opened_rows == 0;
                            ts.opened_rows += 1;
                            ts.cur_cells = Vec::new();
                        }
                    }
                    // Explicit row header marker
                    "tblHeader" if !table_stack.is_empty() => {
                        if let Some(ts) = table_stack.last_mut() {
                            ts.cur_row_is_header = true;
                        }
                    }
                    "tc" if !table_stack.is_empty() => {
                        if let Some(ts) = table_stack.last_mut() {
                            ts.cur_cells.push(CellState {
                                content: Vec::new(),
                                is_header: ts.cur_row_is_header,
                            });
                        }
                    }
                    // Tracked deletions — skip their text
                    "del" => in_del = true,
                    // Images — placeholder span
                    "drawing" | "pict" if in_paragraph => {
                        current_spans.push(json!({
                            "_type": "span",
                            "_key": new_key(),
                            "text": "[Image]",
                            "marks": []
                        }));
                    }
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
                            if run_bold {
                                marks.push(json!("strong"));
                            }
                            if run_italic {
                                marks.push(json!("em"));
                            }
                            if run_underline {
                                marks.push(json!("underline"));
                            }
                            if run_strike {
                                marks.push(json!("strike"));
                            }
                            if run_sub {
                                marks.push(json!("sub"));
                            }
                            if run_sup {
                                marks.push(json!("sup"));
                            }
                            current_spans.push(json!({
                                "_type": "span",
                                "_key": new_key(),
                                "text": run_text.clone(),
                                "marks": marks
                            }));
                        }
                        run_text.clear();
                    }
                    "numPr" => {
                        in_num_pr = false;
                    }
                    "p" if in_paragraph => {
                        in_paragraph = false;
                        if !current_spans.is_empty() || para_style.is_some() {
                            let style = map_para_style(para_style.as_deref());
                            let mut block = json!({
                                "_type": "block",
                                "_key": new_key(),
                                "style": style,
                                "children": current_spans
                            });
                            if let Some(ref align) = para_align {
                                block["textAlign"] = json!(align);
                            }
                            if let Some(num_id) = para_list_numid {
                                let list_item = match num_kinds.get(&num_id) {
                                    Some(ListKind::Bullet) => "bullet",
                                    _ => "number",
                                };
                                block["listItem"] = json!(list_item);
                                block["level"] = json!(para_list_ilvl + 1);
                            }
                            push_block(block, &mut blocks, &mut table_stack);
                        }
                    }
                    "tr" if !table_stack.is_empty() => {
                        if let Some(ts) = table_stack.last_mut() {
                            let cells: Vec<Value> = ts
                                .cur_cells
                                .drain(..)
                                .map(|cell| {
                                    json!({
                                        "_type": "tableCell",
                                        "_key": new_key(),
                                        "isHeader": cell.is_header,
                                        "content": cell.content
                                    })
                                })
                                .collect();
                            ts.rows.push(json!({
                                "_type": "tableRow",
                                "_key": new_key(),
                                "cells": cells
                            }));
                        }
                    }
                    "tbl" => {
                        if let Some(ts) = table_stack.pop() {
                            let tbl = json!({
                                "_type": "table",
                                "_key": new_key(),
                                "rows": ts.rows
                            });
                            push_block(tbl, &mut blocks, &mut table_stack);
                        }
                    }
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

fn map_alignment(val: &str) -> Option<String> {
    match val {
        "left" => Some("left".to_string()),
        "right" => Some("right".to_string()),
        "center" => Some("center".to_string()),
        "both" => Some("justify".to_string()),
        _ => None,
    }
}

fn local_name(name: &[u8]) -> &str {
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
        Some(s) if s.eq_ignore_ascii_case("Heading4") || s == "4" => "h4",
        Some(s) if s.eq_ignore_ascii_case("Heading5") || s == "5" => "h5",
        Some(s) if s.eq_ignore_ascii_case("Heading6") || s == "6" => "h6",
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

    fn make_docx_with_numbering(document_xml: &str, numbering_xml: &str) -> Vec<u8> {
        use std::io::Write;
        let buf = Vec::new();
        let cursor = Cursor::new(buf);
        let mut zip = zip::ZipWriter::new(cursor);

        let opts = zip::write::SimpleFileOptions::default();

        zip.start_file("[Content_Types].xml", opts).unwrap();
        zip.write_all(br#"<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>"#).unwrap();

        zip.start_file("word/document.xml", opts).unwrap();
        zip.write_all(document_xml.as_bytes()).unwrap();

        zip.start_file("word/numbering.xml", opts).unwrap();
        zip.write_all(numbering_xml.as_bytes()).unwrap();

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
        assert_eq!(blocks[0]["_type"], "section");
        let content = blocks[0]["content"].as_array().unwrap();
        assert_eq!(content[0]["children"][0]["text"], "Hello world");
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
        let content = result["blocks"][0]["content"].as_array().unwrap();
        let children = &content[0]["children"];
        let marks = children[0]["marks"].as_array().unwrap();
        assert!(marks.iter().any(|m| m == "strong"), "missing strong");
        assert!(marks.iter().any(|m| m == "em"), "missing em");
    }

    #[test]
    fn parses_underline_strike() {
        let xml = r#"<?xml version="1.0"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r><w:rPr><w:u w:val="single"/><w:strike/></w:rPr><w:t>styled</w:t></w:r>
    </w:p>
  </w:body>
</w:document>"#;
        let docx = make_docx(xml);
        let result = parse_docx(&docx).unwrap();
        let marks = result["blocks"][0]["content"][0]["children"][0]["marks"]
            .as_array()
            .unwrap();
        assert!(marks.iter().any(|m| m == "underline"), "missing underline");
        assert!(marks.iter().any(|m| m == "strike"), "missing strike");
    }

    #[test]
    fn parses_subscript_superscript() {
        let xml = r#"<?xml version="1.0"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>sub</w:t></w:r>
      <w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t>sup</w:t></w:r>
    </w:p>
  </w:body>
</w:document>"#;
        let docx = make_docx(xml);
        let result = parse_docx(&docx).unwrap();
        let children = result["blocks"][0]["content"][0]["children"]
            .as_array()
            .unwrap();
        let sub_marks = children[0]["marks"].as_array().unwrap();
        let sup_marks = children[1]["marks"].as_array().unwrap();
        assert!(sub_marks.iter().any(|m| m == "sub"), "missing sub");
        assert!(sup_marks.iter().any(|m| m == "sup"), "missing sup");
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
        let content = result["blocks"][0]["content"].as_array().unwrap();
        assert_eq!(content[0]["style"], "h1");
    }

    #[test]
    fn parses_all_heading_levels() {
        let xml = r#"<?xml version="1.0"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>H1</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>H2</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading3"/></w:pPr><w:r><w:t>H3</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading4"/></w:pPr><w:r><w:t>H4</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading5"/></w:pPr><w:r><w:t>H5</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading6"/></w:pPr><w:r><w:t>H6</w:t></w:r></w:p>
  </w:body>
</w:document>"#;
        let docx = make_docx(xml);
        let result = parse_docx(&docx).unwrap();
        let content = result["blocks"][0]["content"].as_array().unwrap();
        for (i, expected) in ["h1", "h2", "h3", "h4", "h5", "h6"].iter().enumerate() {
            assert_eq!(content[i]["style"], *expected, "wrong style at index {i}");
        }
    }

    #[test]
    fn parses_alignment() {
        let xml = r#"<?xml version="1.0"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:t>Right</w:t></w:r></w:p>
    <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>Center</w:t></w:r></w:p>
    <w:p><w:pPr><w:jc w:val="both"/></w:pPr><w:r><w:t>Justify</w:t></w:r></w:p>
    <w:p><w:r><w:t>Default</w:t></w:r></w:p>
  </w:body>
</w:document>"#;
        let docx = make_docx(xml);
        let result = parse_docx(&docx).unwrap();
        let content = result["blocks"][0]["content"].as_array().unwrap();
        assert_eq!(content[0]["textAlign"], "right");
        assert_eq!(content[1]["textAlign"], "center");
        assert_eq!(content[2]["textAlign"], "justify");
        assert!(content[3].get("textAlign").is_none() || content[3]["textAlign"].is_null());
    }

    #[test]
    fn parses_bullet_list() {
        let numbering = r#"<?xml version="1.0"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0">
    <w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
</w:numbering>"#;
        let doc = r#"<?xml version="1.0"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>
      <w:r><w:t>Item A</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:numPr><w:ilvl w:val="1"/><w:numId w:val="1"/></w:numPr></w:pPr>
      <w:r><w:t>Item B</w:t></w:r>
    </w:p>
  </w:body>
</w:document>"#;
        let docx = make_docx_with_numbering(doc, numbering);
        let result = parse_docx(&docx).unwrap();
        let content = result["blocks"][0]["content"].as_array().unwrap();
        assert_eq!(content[0]["listItem"], "bullet");
        assert_eq!(content[0]["level"], 1);
        assert_eq!(content[1]["listItem"], "bullet");
        assert_eq!(content[1]["level"], 2);
    }

    #[test]
    fn parses_ordered_list() {
        let numbering = r#"<?xml version="1.0"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0">
    <w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
</w:numbering>"#;
        let doc = r#"<?xml version="1.0"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>
      <w:r><w:t>Step 1</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>
      <w:r><w:t>Step 2</w:t></w:r>
    </w:p>
  </w:body>
</w:document>"#;
        let docx = make_docx_with_numbering(doc, numbering);
        let result = parse_docx(&docx).unwrap();
        let content = result["blocks"][0]["content"].as_array().unwrap();
        assert_eq!(content[0]["listItem"], "number");
        assert_eq!(content[0]["level"], 1);
        assert_eq!(content[1]["listItem"], "number");
    }

    #[test]
    fn parses_table_with_header_row() {
        let xml = r#"<?xml version="1.0"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:tbl>
      <w:tblPr>
        <w:tblLook w:firstRow="1"/>
      </w:tblPr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Header A</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Header B</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Data 1</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Data 2</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>"#;
        let docx = make_docx(xml);
        let result = parse_docx(&docx).unwrap();
        let content = result["blocks"][0]["content"].as_array().unwrap();
        assert_eq!(content[0]["_type"], "table");
        let rows = content[0]["rows"].as_array().unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0]["_type"], "tableRow");
        let header_cells = rows[0]["cells"].as_array().unwrap();
        assert_eq!(header_cells[0]["isHeader"], true);
        assert_eq!(header_cells[1]["isHeader"], true);
        let data_cells = rows[1]["cells"].as_array().unwrap();
        assert_eq!(data_cells[0]["isHeader"], false);
        let cell_text = &data_cells[0]["content"][0]["children"][0]["text"];
        assert_eq!(cell_text, "Data 1");
    }

    #[test]
    fn rejects_non_docx() {
        let result = parse_docx(b"this is not a zip file");
        assert!(result.is_err());
    }

    /// Smoke test against the real test fixture in the repo root.
    /// Verifies all major feature areas are parsed correctly.
    #[test]
    fn parses_test_fixture() {
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../Test 1.docx"
        );
        let data = match std::fs::read(path) {
            Ok(d) => d,
            Err(_) => return, // fixture not present — skip
        };
        let result = parse_docx(&data).unwrap();
        let content = result["blocks"][0]["content"].as_array().unwrap();

        // h1 through h6 are all present
        let styles: Vec<&str> = content
            .iter()
            .filter_map(|b| b["style"].as_str())
            .collect();
        for h in ["h1", "h2", "h3", "h4", "h5", "h6"] {
            assert!(styles.contains(&h), "missing style {h}");
        }

        // At least one block with textAlign = "justify"
        assert!(
            content.iter().any(|b| b["textAlign"] == "justify"),
            "no justified paragraph found"
        );

        // Bullet and ordered list items
        assert!(
            content.iter().any(|b| b["listItem"] == "bullet"),
            "no bullet list items"
        );
        assert!(
            content.iter().any(|b| b["listItem"] == "number"),
            "no ordered list items"
        );

        // Multi-level list: level 2 or 3 should appear
        assert!(
            content.iter().any(|b| b["level"].as_u64().unwrap_or(0) >= 2),
            "no nested list items found"
        );

        // At least one sub and one sup mark somewhere
        let has_mark = |mark: &str| {
            content.iter().any(|b| {
                b["children"]
                    .as_array()
                    .map(|spans| {
                        spans.iter().any(|span| {
                            span["marks"]
                                .as_array()
                                .map(|marks| marks.iter().any(|m| m == mark))
                                .unwrap_or(false)
                        })
                    })
                    .unwrap_or(false)
            })
        };
        assert!(has_mark("sub"), "no subscript mark found");
        assert!(has_mark("sup"), "no superscript mark found");

        // Table present with header row
        let table = content.iter().find(|b| b["_type"] == "table");
        assert!(table.is_some(), "no table found");
        let rows = table.unwrap()["rows"].as_array().unwrap();
        assert!(!rows.is_empty(), "table has no rows");
        let first_row_cells = rows[0]["cells"].as_array().unwrap();
        assert!(
            first_row_cells.iter().any(|c| c["isHeader"] == true),
            "first row has no header cells"
        );
    }
}
