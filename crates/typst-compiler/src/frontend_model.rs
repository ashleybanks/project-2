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
    DerivedFieldIntent(FrontendDerivedFieldIntent),
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
    pub field_path: Option<String>,
    pub expression: Option<String>,
    pub expression_label: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct FrontendDerivedFieldIntent {
    pub expression_label: String,
    pub expression: Option<String>,
}

// ── Mapping ───────────────────────────────────────────────────────────────────

pub fn map_to_block_model(blocks: Vec<FrontendTopLevel>) -> BlockModel {
    let mut idx = 0usize;
    BlockModel {
        blocks: blocks.into_iter().flat_map(|b| map_top_level(b, &mut idx)).collect(),
    }
}

fn map_top_level(entry: FrontendTopLevel, idx: &mut usize) -> Vec<Block> {
    match entry {
        FrontendTopLevel::Block(b) => vec![Block::Text(TextBlock {
            style_class: None,
            content: vec![map_frontend_block(b, idx)],
        })],
        // Sections with unresolved intents: render content naively, ignoring the condition/repeat
        FrontendTopLevel::Section(s) => {
            s.content.into_iter().flat_map(|b| map_top_level(b, idx)).collect()
        }
        FrontendTopLevel::Table(t) => vec![Block::Table(map_frontend_table(t, idx))],
    }
}

fn map_frontend_block(b: FrontendBlock, idx: &mut usize) -> ModelPtBlock {
    ModelPtBlock {
        block_type: "block".into(),
        style: Some(b.style),
        children: b.children.into_iter().filter_map(|c| map_child(c, idx)).collect(),
        list_item: b.list_item,
        level: b.level,
    }
}

fn map_frontend_table(t: FrontendTable, idx: &mut usize) -> TableBlock {
    TableBlock {
        rows: t.rows.into_iter().map(|row| {
            let is_header = row.cells.first().map(|c| c.is_header).unwrap_or(false);
            TableRow {
                is_header,
                cells: row.cells.into_iter().map(|cell| TableCell {
                    content: cell.content.into_iter().map(|b| map_frontend_block(b, idx)).collect(),
                }).collect(),
            }
        }).collect(),
    }
}

fn map_child(child: FrontendChild, idx: &mut usize) -> Option<PtChild> {
    match child {
        FrontendChild::Span(s) => Some(PtChild::Span(PtSpan {
            text: s.text,
            marks: s.marks,
        })),
        FrontendChild::FieldIntent(fi) => {
            // By this point expression-bearing intents have already had their
            // `field_path` swapped to a placeholder by `apply_expression_entries`,
            // so both branches below emit a MergeField the same way. Every
            // resolved MergeField gets a stable `fi-N` label for SVG overlay
            // position lookup (see `compiler::compile_intent_index`).
            if let Some(path) = fi.field_path {
                let key = format!("fi-{idx}");
                *idx += 1;
                Some(PtChild::MergeField(crate::model::PtMergeField {
                    field: path,
                    intent_key: Some(key),
                }))
            } else {
                // Unresolved intent: render the label as plain text so it's visible
                Some(PtChild::Span(PtSpan { text: fi.label, marks: vec![] }))
            }
        }
        FrontendChild::DerivedFieldIntent(dfi) => {
            Some(PtChild::Span(PtSpan {
                text: format!("[{}]", dfi.expression_label),
                marks: vec![],
            }))
        }
    }
}

// ── Expression entry collection / application ────────────────────────────────

/// Represents a FieldIntent that has a Liquid expression requiring server-side evaluation.
/// `placeholder` is the synthetic payload key injected at render time.
pub struct ExpressionEntry {
    pub placeholder: String,
    pub expression: String,
}

/// Evaluate all expressions in `blocks` against `payload`, mutate the blocks to use
/// placeholder keys, and return the augmented payload. Single call covers both WASM
/// preview and server-side PDF render.
pub fn evaluate_and_apply_expressions(
    blocks: &mut Vec<FrontendTopLevel>,
    payload: &serde_json::Value,
) -> serde_json::Value {
    let entries = collect_expression_entries(blocks);
    if entries.is_empty() {
        return payload.clone();
    }
    let augmented = evaluate_expressions(&entries, payload);
    apply_expression_entries(blocks, &entries);
    augmented
}

/// Parse `expression` as a Liquid filter chain (wrapped in `{{ }}`).
/// Returns `Ok(())` if valid, `Err(message)` if not.
pub fn validate_liquid_expression(expression: &str) -> Result<(), String> {
    let parser = liquid::ParserBuilder::with_stdlib()
        .build()
        .map_err(|e| format!("Liquid parser init: {e}"))?;
    parser
        .parse(&format!("{{{{ {} }}}}", expression))
        .map(|_| ())
        .map_err(|e| e.to_string())
}

fn evaluate_expressions(
    entries: &[ExpressionEntry],
    payload: &serde_json::Value,
) -> serde_json::Value {
    let parser = match liquid::ParserBuilder::with_stdlib().build() {
        Ok(p) => p,
        Err(_) => return payload.clone(),
    };
    let globals = json_to_liquid_object(payload);
    let mut augmented = payload.clone();
    for entry in entries {
        let tmpl_str = format!("{{{{ {} }}}}", entry.expression);
        let rendered = parser
            .parse(&tmpl_str)
            .and_then(|t| t.render(&globals))
            .unwrap_or_default();
        let rendered = apply_ordinal_suffix(rendered);
        if let serde_json::Value::Object(ref mut map) = augmented {
            map.insert(entry.placeholder.clone(), serde_json::Value::String(rendered));
        }
    }
    augmented
}

/// Replace `%q` in a rendered string with the ordinal suffix of the preceding digits.
/// liquid-core passes unknown strftime codes through as literal text, so `%-d%q` renders
/// as e.g. "15%q" which we then post-process to "15th".
fn apply_ordinal_suffix(s: String) -> String {
    if !s.contains("%q") {
        return s;
    }
    let mut result = String::new();
    let mut remaining = s.as_str();
    while let Some(pos) = remaining.find("%q") {
        let before = &remaining[..pos];
        let digit_start = before
            .rfind(|c: char| !c.is_ascii_digit())
            .map_or(0, |i| i + 1);
        result.push_str(&before[..digit_start]);
        if let Ok(n) = before[digit_start..].parse::<u32>() {
            result.push_str(&n.to_string());
            result.push_str(ordinal_suffix(n));
        } else {
            result.push_str(before);
        }
        remaining = &remaining[pos + 2..];
    }
    result.push_str(remaining);
    result
}

fn ordinal_suffix(n: u32) -> &'static str {
    if matches!(n % 100, 11..=13) {
        return "th";
    }
    match n % 10 {
        1 => "st",
        2 => "nd",
        3 => "rd",
        _ => "th",
    }
}

/// Returns true for strings that look like a bare ISO date: `YYYY-MM-DD`.
/// liquid's date filter requires a time component, so callers should append
/// ` 00:00:00 +0000` before passing to liquid.
fn is_iso_date_only(s: &str) -> bool {
    if s.len() != 10 {
        return false;
    }
    let b = s.as_bytes();
    b[4] == b'-' && b[7] == b'-'
        && b[..4].iter().all(|c| c.is_ascii_digit())
        && b[5..7].iter().all(|c| c.is_ascii_digit())
        && b[8..10].iter().all(|c| c.is_ascii_digit())
}

fn json_to_liquid_object(v: &serde_json::Value) -> liquid::Object {
    if let serde_json::Value::Object(map) = v {
        map.iter()
            .map(|(k, v)| (k.clone().into(), json_to_liquid_value(v)))
            .collect()
    } else {
        liquid::Object::new()
    }
}

fn json_to_liquid_value(v: &serde_json::Value) -> liquid::model::Value {
    match v {
        serde_json::Value::Null => liquid::model::Value::Nil,
        serde_json::Value::Bool(b) => liquid::model::Value::scalar(*b),
        serde_json::Value::Number(n) => n
            .as_f64()
            .map(liquid::model::Value::scalar)
            .unwrap_or(liquid::model::Value::Nil),
        serde_json::Value::String(s) => {
            // liquid's date filter requires a time component; normalise ISO date-only
            // strings (YYYY-MM-DD) so the date filter can parse them.
            let v = if is_iso_date_only(s) {
                format!("{} 00:00:00 +0000", s)
            } else {
                s.clone()
            };
            liquid::model::Value::scalar(v)
        }
        serde_json::Value::Array(arr) => {
            liquid::model::Value::Array(arr.iter().map(json_to_liquid_value).collect())
        }
        serde_json::Value::Object(obj) => liquid::model::Value::Object(
            obj.iter()
                .map(|(k, v)| (k.clone().into(), json_to_liquid_value(v)))
                .collect(),
        ),
    }
}

/// Walk `blocks` and return one `ExpressionEntry` per `FieldIntent` that has an expression.
/// Entries are ordered by tree traversal order; `apply_expression_entries` must use the same order.
pub fn collect_expression_entries(blocks: &[FrontendTopLevel]) -> Vec<ExpressionEntry> {
    let mut out = Vec::new();
    let mut idx = 0usize;
    collect_from_top_level_slice(blocks, &mut out, &mut idx);
    out
}

fn collect_from_top_level_slice(
    blocks: &[FrontendTopLevel],
    out: &mut Vec<ExpressionEntry>,
    idx: &mut usize,
) {
    for block in blocks {
        match block {
            FrontendTopLevel::Block(b) => collect_from_block(b, out, idx),
            FrontendTopLevel::Section(s) => collect_from_top_level_slice(&s.content, out, idx),
            FrontendTopLevel::Table(t) => {
                for row in &t.rows {
                    for cell in &row.cells {
                        for b in &cell.content {
                            collect_from_block(b, out, idx);
                        }
                    }
                }
            }
        }
    }
}

fn collect_from_block(b: &FrontendBlock, out: &mut Vec<ExpressionEntry>, idx: &mut usize) {
    for child in &b.children {
        if let FrontendChild::FieldIntent(fi) = child {
            if let Some(expr) = &fi.expression {
                out.push(ExpressionEntry {
                    placeholder: format!("__expr_{idx}__"),
                    expression: expr.clone(),
                });
                *idx += 1;
            }
        }
    }
}

/// Mutate `blocks` in-place: for each FieldIntent that has an expression,
/// replace `field_path` with the entry's `placeholder` and clear `expression`
/// so that `map_to_block_model` emits a standard `MergeField`.
pub fn apply_expression_entries(blocks: &mut Vec<FrontendTopLevel>, entries: &[ExpressionEntry]) {
    let mut idx = 0usize;
    apply_to_top_level_slice(blocks, entries, &mut idx);
}

fn apply_to_top_level_slice(
    blocks: &mut Vec<FrontendTopLevel>,
    entries: &[ExpressionEntry],
    idx: &mut usize,
) {
    for block in blocks.iter_mut() {
        match block {
            FrontendTopLevel::Block(b) => apply_to_block(b, entries, idx),
            FrontendTopLevel::Section(s) => apply_to_top_level_slice(&mut s.content, entries, idx),
            FrontendTopLevel::Table(t) => {
                for row in t.rows.iter_mut() {
                    for cell in row.cells.iter_mut() {
                        for b in cell.content.iter_mut() {
                            apply_to_block(b, entries, idx);
                        }
                    }
                }
            }
        }
    }
}

fn apply_to_block(b: &mut FrontendBlock, entries: &[ExpressionEntry], idx: &mut usize) {
    for child in b.children.iter_mut() {
        if let FrontendChild::FieldIntent(fi) = child {
            if fi.expression.is_some() && *idx < entries.len() {
                fi.field_path = Some(entries[*idx].placeholder.clone());
                fi.expression = None;
                *idx += 1;
            }
        }
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
    fn field_intent_with_path_becomes_merge_field() {
        let json = r#"[
          {"_type":"block","_key":"k1","style":"normal","children":[
            {"_type":"span","_key":"k2","text":"Number: ","marks":[]},
            {"_type":"fieldIntent","_key":"k3","label":"Invoice Number","field_path":"invoice_number"},
            {"_type":"span","_key":"k4","text":" end","marks":[]}
          ]}
        ]"#;
        let blocks: Vec<FrontendTopLevel> = serde_json::from_str(json).unwrap();
        let model = map_to_block_model(blocks);
        let source = crate::compile(&model, None);
        assert!(source.contains("Number: "), "got:\n{source}");
        assert!(source.contains("#data.invoice_number"), "expected merge field, got:\n{source}");
        assert!(source.contains(" end"), "got:\n{source}");
    }

    #[test]
    fn field_intent_without_path_renders_label() {
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
        assert!(source.contains("Invoice Number"), "unresolved intent should show label, got:\n{source}");
    }
}
