use serde::Deserialize;

use crate::model::{
    Block, BlockModel, PtBlock as ModelPtBlock, PtChild, PtSpan, TableBlock, TableCell, TableRow,
    TextBlock,
};

// ── Frontend JSON types (mirrors apps/web/src/lib/api.ts) ────────────────────

#[derive(Debug, Deserialize)]
#[serde(tag = "_type", rename_all = "camelCase")]
pub enum FrontendTopLevel {
    Block(FrontendBlock),
    Section(FrontendSection),
    Table(FrontendTable),
}

#[derive(Debug, Deserialize)]
pub struct FrontendBlock {
    pub style: String,
    #[serde(default)]
    pub children: Vec<FrontendChild>,
    #[serde(rename = "textAlign")]
    pub text_align: Option<String>,
    #[serde(rename = "listItem")]
    pub list_item: Option<String>,
    pub level: Option<u32>,
}

#[derive(Debug, Deserialize)]
pub struct FrontendSection {
    #[serde(rename = "conditionIntent")]
    pub condition_intent: Option<String>,
    #[serde(rename = "repeatIntent")]
    pub repeat_intent: Option<String>,
    #[serde(default)]
    pub content: Vec<FrontendTopLevel>,
}

#[derive(Debug, Deserialize)]
pub struct FrontendTable {
    #[serde(default)]
    pub rows: Vec<FrontendTableRow>,
}

#[derive(Debug, Deserialize)]
pub struct FrontendTableRow {
    #[serde(default)]
    pub cells: Vec<FrontendTableCell>,
}

#[derive(Debug, Deserialize)]
pub struct FrontendTableCell {
    #[serde(rename = "isHeader", default)]
    pub is_header: bool,
    #[serde(default)]
    pub content: Vec<FrontendBlock>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "_type", rename_all = "camelCase")]
pub enum FrontendChild {
    Span(FrontendSpan),
    FieldIntent(FrontendFieldIntent),
}

#[derive(Debug, Deserialize)]
pub struct FrontendSpan {
    pub text: String,
    #[serde(default)]
    pub marks: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct FrontendFieldIntent {
    pub label: String,
}

// ── Mapping ───────────────────────────────────────────────────────────────────

pub fn map_to_block_model(blocks: Vec<FrontendTopLevel>) -> BlockModel {
    BlockModel {
        blocks: blocks.into_iter().flat_map(map_top_level).collect(),
    }
}

fn map_top_level(entry: FrontendTopLevel) -> Vec<Block> {
    match entry {
        FrontendTopLevel::Block(b) => vec![Block::Text(TextBlock {
            style_class: None,
            content: vec![map_frontend_block(b)],
        })],
        // Sections with unresolved intents: render content naively, ignoring the condition/repeat
        FrontendTopLevel::Section(s) => {
            s.content.into_iter().flat_map(map_top_level).collect()
        }
        FrontendTopLevel::Table(t) => vec![Block::Table(map_frontend_table(t))],
    }
}

fn map_frontend_block(b: FrontendBlock) -> ModelPtBlock {
    ModelPtBlock {
        block_type: "block".into(),
        style: Some(b.style),
        children: b.children.into_iter().filter_map(map_child).collect(),
        list_item: b.list_item,
        level: b.level,
    }
}

fn map_frontend_table(t: FrontendTable) -> TableBlock {
    TableBlock {
        rows: t.rows.into_iter().map(|row| {
            let is_header = row.cells.first().map(|c| c.is_header).unwrap_or(false);
            TableRow {
                is_header,
                cells: row.cells.into_iter().map(|cell| TableCell {
                    content: cell.content.into_iter().map(map_frontend_block).collect(),
                }).collect(),
            }
        }).collect(),
    }
}

fn map_child(child: FrontendChild) -> Option<PtChild> {
    match child {
        FrontendChild::Span(s) => Some(PtChild::Span(PtSpan {
            text: s.text,
            marks: s.marks,
        })),
        FrontendChild::FieldIntent(_) => None,
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_plain_text() {
        let json = r#"[
          {"_type":"block","_key":"k1","style":"normal","children":[
            {"_type":"span","_key":"k2","text":"Hello world","marks":[]}
          ]}
        ]"#;
        let blocks: Vec<FrontendTopLevel> = serde_json::from_str(json).unwrap();
        let model = map_to_block_model(blocks);
        let source = crate::compile(&model, None);
        assert!(source.contains("Hello world"), "expected text in output, got:\n{source}");
    }

    #[test]
    fn heading_styles_preserved() {
        let json = r#"[
          {"_type":"block","_key":"k1","style":"h1","children":[
            {"_type":"span","_key":"k2","text":"My Heading","marks":[]}
          ]}
        ]"#;
        let blocks: Vec<FrontendTopLevel> = serde_json::from_str(json).unwrap();
        let model = map_to_block_model(blocks);
        let source = crate::compile(&model, None);
        assert!(source.contains("= My Heading"), "expected h1 in output, got:\n{source}");
    }

    #[test]
    fn section_content_rendered_naively() {
        let json = r#"[
          {"_type":"section","_key":"s1","conditionIntent":"If paid","content":[
            {"_type":"block","_key":"k1","style":"normal","children":[
              {"_type":"span","_key":"k2","text":"Payment received","marks":[]}
            ]}
          ]}
        ]"#;
        let blocks: Vec<FrontendTopLevel> = serde_json::from_str(json).unwrap();
        let model = map_to_block_model(blocks);
        let source = crate::compile(&model, None);
        assert!(source.contains("Payment received"), "section content should render naively, got:\n{source}");
    }

    #[test]
    fn stylesheet_applied_via_compile() {
        let stylesheet = crate::model::StylesheetDef {
            body_font: Some("Latin Modern Roman".into()),
            ..Default::default()
        };
        let json = r#"[{"_type":"block","_key":"k1","style":"normal","children":[{"_type":"span","_key":"k2","text":"Hello","marks":[]}]}]"#;
        let blocks: Vec<FrontendTopLevel> = serde_json::from_str(json).unwrap();
        let model = map_to_block_model(blocks);
        let source = crate::compile(&model, Some(&stylesheet));
        assert!(source.contains("\"Latin Modern Roman\""), "expected custom font, got:\n{source}");
    }

    #[test]
    fn frontend_table_compiles() {
        let json = r#"[
          {"_type":"table","_key":"t1","rows":[
            {"_type":"tableRow","_key":"r1","cells":[
              {"_type":"tableCell","_key":"c1","isHeader":true,"content":[
                {"_type":"block","_key":"b1","style":"normal","children":[{"_type":"span","_key":"s1","text":"Name","marks":[]}]}
              ]},
              {"_type":"tableCell","_key":"c2","isHeader":true,"content":[
                {"_type":"block","_key":"b2","style":"normal","children":[{"_type":"span","_key":"s2","text":"Age","marks":[]}]}
              ]}
            ]},
            {"_type":"tableRow","_key":"r2","cells":[
              {"_type":"tableCell","_key":"c3","isHeader":false,"content":[
                {"_type":"block","_key":"b3","style":"normal","children":[{"_type":"span","_key":"s3","text":"Alice","marks":[]}]}
              ]},
              {"_type":"tableCell","_key":"c4","isHeader":false,"content":[
                {"_type":"block","_key":"b4","style":"normal","children":[{"_type":"span","_key":"s4","text":"30","marks":[]}]}
              ]}
            ]}
          ]}
        ]"#;
        let blocks: Vec<FrontendTopLevel> = serde_json::from_str(json).unwrap();
        let model = map_to_block_model(blocks);
        let source = crate::compile(&model, None);
        assert!(source.contains("#table("), "expected #table(, got:\n{source}");
        assert!(source.contains("columns: (1fr, 1fr)"), "expected fractional columns, got:\n{source}");
        assert!(source.contains("table.header("), "expected table.header(), got:\n{source}");
        assert!(source.contains("[Alice]"), "expected [Alice] cell, got:\n{source}");
    }

    #[test]
    fn frontend_bullet_list_compiles() {
        let json = r#"[
          {"_type":"block","_key":"k1","style":"normal","listItem":"bullet","level":1,"children":[
            {"_type":"span","_key":"k2","text":"Buy milk","marks":[]}
          ]}
        ]"#;
        let blocks: Vec<FrontendTopLevel> = serde_json::from_str(json).unwrap();
        let model = map_to_block_model(blocks);
        let source = crate::compile(&model, None);
        assert!(source.contains("- Buy milk"), "expected bullet list item, got:\n{source}");
    }

    #[test]
    fn field_intent_silently_dropped() {
        let json = r#"[
          {"_type":"block","_key":"k1","style":"normal","children":[
            {"_type":"span","_key":"k2","text":"Before","marks":[]},
            {"_type":"fieldIntent","_key":"k3","label":"Invoice Number"},
            {"_type":"span","_key":"k4","text":"After","marks":[]}
          ]}
        ]"#;
        let blocks: Vec<FrontendTopLevel> = serde_json::from_str(json).unwrap();
        let model = map_to_block_model(blocks);
        let source = crate::compile(&model, None);
        assert!(source.contains("Before"), "got:\n{source}");
        assert!(source.contains("After"), "got:\n{source}");
        assert!(!source.contains("Invoice Number"), "intent label should be dropped, got:\n{source}");
    }
}
