use crate::model::*;

pub fn compile(model: &BlockModel, stylesheet: Option<&StylesheetDef>) -> String {
    let preamble = preamble(stylesheet);
    let content = compile_blocks(&model.blocks, &[]);
    format!("#let data = json(\"data.json\")\n\n{preamble}\n\n{content}")
}

fn preamble(stylesheet: Option<&StylesheetDef>) -> String {
    let body_font = stylesheet
        .and_then(|s| s.body_font.as_deref())
        .unwrap_or("New Computer Modern");
    let font_size = stylesheet
        .and_then(|s| s.normal.as_ref())
        .and_then(|n| n.font_size)
        .unwrap_or(11.0);
    let body_colour = stylesheet.and_then(|s| s.body_colour.as_deref());
    let heading_font = stylesheet.and_then(|s| s.heading_font.as_deref());
    let heading_colour = stylesheet.and_then(|s| s.heading_colour.as_deref());

    let mut lines = vec![
        r#"#set page(paper: "a4", margin: (x: 2.5cm, y: 2cm))"#.to_owned(),
        format!("#set text(font: \"{body_font}\", size: {font_size}pt)"),
        "#set par(leading: 0.65em)".to_owned(),
    ];

    if let Some(colour) = body_colour {
        lines.push(format!("#set text(fill: rgb(\"{colour}\"))"));
    }

    if heading_font.is_some() || heading_colour.is_some() {
        let mut parts = vec![];
        if let Some(f) = heading_font {
            parts.push(format!("font: \"{f}\""));
        }
        if let Some(c) = heading_colour {
            parts.push(format!("fill: rgb(\"{c}\")"));
        }
        lines.push(format!("#show heading: set text({})", parts.join(", ")));
    }

    lines.join("\n")
}

fn compile_blocks(blocks: &[Block], loop_vars: &[&str]) -> String {
    blocks
        .iter()
        .map(|b| compile_block(b, loop_vars))
        .collect::<Vec<_>>()
        .join("\n\n")
}

pub fn compile_block(block: &Block, loop_vars: &[&str]) -> String {
    match block {
        Block::Text(b) => compile_text_block(b, loop_vars),
        Block::Repeating(b) => compile_repeating_block(b, loop_vars),
        Block::Conditional(b) => compile_conditional_block(b, loop_vars),
        Block::Table(b) => compile_table_block(b),
    }
}

fn compile_table_block(block: &crate::model::TableBlock) -> String {
    let cols = block.rows.first().map(|r| r.cells.len()).unwrap_or(1);

    let rows: Vec<String> = block.rows.iter().map(|row| {
        let cells: Vec<String> = row.cells.iter().map(|cell| {
            let content = cell.content.iter()
                .map(|b| compile_pt_block(b, &[]))
                .collect::<Vec<_>>()
                .join(" ");
            format!("[{content}]")
        }).collect();
        if row.is_header {
            format!("  table.header({})", cells.join(", "))
        } else {
            format!("  {}", cells.join(", "))
        }
    }).collect();

    format!("#table(\n  columns: {cols},\n{}\n)", rows.join(",\n"))
}

fn compile_text_block(block: &TextBlock, loop_vars: &[&str]) -> String {
    block
        .content
        .iter()
        .map(|pt| compile_pt_block(pt, loop_vars))
        .collect::<Vec<_>>()
        .join("\n")
}

pub fn compile_pt_block(block: &PtBlock, loop_vars: &[&str]) -> String {
    let inline = block
        .children
        .iter()
        .map(|c| compile_pt_inline(c, loop_vars))
        .collect::<String>();

    if let Some(list_item) = &block.list_item {
        let level = block.level.unwrap_or(1).max(1) as usize;
        let indent = "  ".repeat(level - 1);
        let marker = if list_item == "number" { "+" } else { "-" };
        return format!("{indent}{marker} {inline}");
    }

    match block.style.as_deref() {
        Some("h1") => format!("= {inline}"),
        Some("h2") => format!("== {inline}"),
        Some("h3") => format!("=== {inline}"),
        _ => inline,
    }
}

pub fn compile_pt_inline(child: &PtChild, loop_vars: &[&str]) -> String {
    match child {
        PtChild::Span(span) => compile_span(span),
        PtChild::MergeField(mf) => {
            // If the first path segment is a loop variable in scope, reference
            // it directly (e.g. `item.description`) rather than via `data.`
            let first = mf.field.split('.').next().unwrap_or("");
            if loop_vars.contains(&first) {
                format!("#{}", mf.field)
            } else {
                format!("#data.{}", mf.field)
            }
        }
    }
}

fn compile_span(span: &PtSpan) -> String {
    let text = &span.text;
    let strong = span.marks.contains(&"strong".to_string());
    let em = span.marks.contains(&"em".to_string());
    match (strong, em) {
        (true, true) => format!("*_{text}_*"),
        (true, false) => format!("*{text}*"),
        (false, true) => format!("_{text}_"),
        (false, false) => text.clone(),
    }
}

fn compile_repeating_block(block: &RepeatingBlock, loop_vars: &[&str]) -> String {
    let field = &block.field;
    let item_var = field.split('.').last().unwrap_or("item");
    let item_var = item_var.strip_suffix('s').unwrap_or(item_var);

    // Add the loop variable to scope for child compilation
    let mut child_vars: Vec<&str> = loop_vars.to_vec();
    child_vars.push(item_var);

    let body = compile_blocks(&block.blocks, &child_vars);

    if let Some(empty) = &block.empty_state {
        let empty_body = compile_blocks(empty, loop_vars);
        format!(
            "#if data.{field}.len() > 0 [\n  #for {item_var} in data.{field} [\n{body}\n\n  ]\n] else [\n{empty_body}\n]"
        )
    } else {
        format!("#for {item_var} in data.{field} [\n{body}\n\n]")
    }
}

fn compile_conditional_block(block: &ConditionalBlock, loop_vars: &[&str]) -> String {
    let cond = compile_condition(&block.condition, loop_vars);
    let body = compile_blocks(&block.blocks, loop_vars);
    format!("#if {cond} [\n{body}\n]")
}

fn compile_condition(tree: &ConditionTree, loop_vars: &[&str]) -> String {
    match tree {
        ConditionTree::Eq(c) => format!("{} == {}", field_ref(&c.field, loop_vars), json_val(&c.value)),
        ConditionTree::Ne(c) => format!("{} != {}", field_ref(&c.field, loop_vars), json_val(&c.value)),
        ConditionTree::Gt(c) => format!("{} > {}",  field_ref(&c.field, loop_vars), json_val(&c.value)),
        ConditionTree::Lt(c) => format!("{} < {}",  field_ref(&c.field, loop_vars), json_val(&c.value)),
        ConditionTree::Gte(c) => format!("{} >= {}", field_ref(&c.field, loop_vars), json_val(&c.value)),
        ConditionTree::Lte(c) => format!("{} <= {}", field_ref(&c.field, loop_vars), json_val(&c.value)),
        ConditionTree::IsEmpty { field } => format!("{} == \"\"", field_ref(field, loop_vars)),
        ConditionTree::IsNotEmpty { field } => format!("{} != \"\"", field_ref(field, loop_vars)),
        ConditionTree::HasItems { field } => format!("{}.len() > 0", field_ref(field, loop_vars)),
        ConditionTree::All { conditions } => {
            let parts: Vec<_> = conditions.iter().map(|c| compile_condition(c, loop_vars)).collect();
            format!("({})", parts.join(" and "))
        }
        ConditionTree::Any { conditions } => {
            let parts: Vec<_> = conditions.iter().map(|c| compile_condition(c, loop_vars)).collect();
            format!("({})", parts.join(" or "))
        }
    }
}

fn field_ref(field: &str, loop_vars: &[&str]) -> String {
    let first = field.split('.').next().unwrap_or("");
    if loop_vars.contains(&first) {
        field.to_string()
    } else {
        format!("data.{field}")
    }
}

fn json_val(v: &serde_json::Value) -> String {
    match v {
        serde_json::Value::String(s) => format!("\"{s}\""),
        serde_json::Value::Number(n) => n.to_string(),
        serde_json::Value::Bool(b) => b.to_string(),
        other => format!("\"{other}\""),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::*;

    #[test]
    fn span_no_marks() {
        let child = PtChild::Span(PtSpan { text: "hello".into(), marks: vec![] });
        assert_eq!(compile_pt_inline(&child, &[]), "hello");
    }

    #[test]
    fn span_bold() {
        let child = PtChild::Span(PtSpan { text: "hello".into(), marks: vec!["strong".into()] });
        assert_eq!(compile_pt_inline(&child, &[]), "*hello*");
    }

    #[test]
    fn span_italic() {
        let child = PtChild::Span(PtSpan { text: "hello".into(), marks: vec!["em".into()] });
        assert_eq!(compile_pt_inline(&child, &[]), "_hello_");
    }

    #[test]
    fn span_bold_italic() {
        let child = PtChild::Span(PtSpan {
            text: "hello".into(),
            marks: vec!["strong".into(), "em".into()],
        });
        assert_eq!(compile_pt_inline(&child, &[]), "*_hello_*");
    }

    #[test]
    fn merge_field_top_level() {
        let child = PtChild::MergeField(PtMergeField { field: "invoice.total".into() });
        assert_eq!(compile_pt_inline(&child, &[]), "#data.invoice.total");
    }

    #[test]
    fn merge_field_in_loop() {
        let child = PtChild::MergeField(PtMergeField { field: "item.description".into() });
        assert_eq!(compile_pt_inline(&child, &["item"]), "#item.description");
    }

    #[test]
    fn conditional_eq() {
        let block = ConditionalBlock {
            condition: ConditionTree::Eq(BinaryCondition {
                field: "invoice.status".into(),
                value: serde_json::Value::String("paid".into()),
            }),
            blocks: vec![],
        };
        let out = compile_conditional_block(&block, &[]);
        assert!(out.contains("data.invoice.status == \"paid\""), "got: {out}");
    }

    #[test]
    fn repeating_with_empty_state() {
        let block = RepeatingBlock {
            field: "invoice.items".into(),
            blocks: vec![],
            empty_state: Some(vec![]),
        };
        let out = compile_repeating_block(&block, &[]);
        assert!(out.contains("if data.invoice.items.len() > 0"), "got: {out}");
        assert!(out.contains("else"), "got: {out}");
    }

    fn stylesheet(body_font: Option<&str>, heading_font: Option<&str>, heading_colour: Option<&str>) -> StylesheetDef {
        StylesheetDef {
            body_font: body_font.map(str::to_owned),
            heading_font: heading_font.map(str::to_owned),
            heading_colour: heading_colour.map(str::to_owned),
            ..Default::default()
        }
    }

    #[test]
    fn stylesheet_body_font_applied() {
        let s = stylesheet(Some("Helvetica"), None, None);
        let model = BlockModel { blocks: vec![] };
        let source = compile(&model, Some(&s));
        assert!(source.contains("\"Helvetica\""), "expected body font, got:\n{source}");
    }

    #[test]
    fn stylesheet_heading_font_applied() {
        let s = stylesheet(None, Some("Georgia"), None);
        let model = BlockModel { blocks: vec![] };
        let source = compile(&model, Some(&s));
        assert!(source.contains("\"Georgia\""), "expected heading font, got:\n{source}");
    }

    #[test]
    fn stylesheet_heading_colour_applied() {
        let s = stylesheet(None, None, Some("#1a1a2e"));
        let model = BlockModel { blocks: vec![] };
        let source = compile(&model, Some(&s));
        assert!(source.contains("rgb(\"#1a1a2e\")"), "expected heading colour, got:\n{source}");
    }

    #[test]
    fn stylesheet_none_uses_defaults() {
        let model = BlockModel { blocks: vec![] };
        let source = compile(&model, None);
        assert!(source.contains("\"New Computer Modern\""), "expected default font, got:\n{source}");
    }

    fn bullet_block(text: &str, level: u32) -> PtBlock {
        PtBlock {
            block_type: "block".into(),
            style: Some("normal".into()),
            list_item: Some("bullet".into()),
            level: Some(level),
            children: vec![PtChild::Span(PtSpan { text: text.into(), marks: vec![] })],
        }
    }

    fn numbered_block(text: &str, level: u32) -> PtBlock {
        PtBlock {
            block_type: "block".into(),
            style: Some("normal".into()),
            list_item: Some("number".into()),
            level: Some(level),
            children: vec![PtChild::Span(PtSpan { text: text.into(), marks: vec![] })],
        }
    }

    #[test]
    fn bullet_list_item_compiles() {
        let out = compile_pt_block(&bullet_block("First item", 1), &[]);
        assert_eq!(out, "- First item");
    }

    #[test]
    fn numbered_list_item_compiles() {
        let out = compile_pt_block(&numbered_block("Step one", 1), &[]);
        assert_eq!(out, "+ Step one");
    }

    #[test]
    fn nested_bullet_list_item_indented() {
        let out = compile_pt_block(&bullet_block("Nested", 2), &[]);
        assert_eq!(out, "  - Nested");
    }

    fn make_table(header: bool, rows: Vec<Vec<&str>>) -> crate::model::TableBlock {
        use crate::model::{TableBlock, TableCell, TableRow};
        TableBlock {
            rows: rows.into_iter().enumerate().map(|(i, cells)| TableRow {
                is_header: header && i == 0,
                cells: cells.into_iter().map(|text| TableCell {
                    content: vec![PtBlock {
                        block_type: "block".into(),
                        style: Some("normal".into()),
                        list_item: None,
                        level: None,
                        children: vec![PtChild::Span(PtSpan { text: text.into(), marks: vec![] })],
                    }],
                }).collect(),
            }).collect(),
        }
    }

    #[test]
    fn table_column_count() {
        let table = make_table(false, vec![vec!["A", "B", "C"], vec!["1", "2", "3"]]);
        let out = compile_table_block(&table);
        assert!(out.contains("columns: 3"), "expected columns: 3, got:\n{out}");
    }

    #[test]
    fn table_header_row_wrapped() {
        let table = make_table(true, vec![vec!["Name", "Age"], vec!["Alice", "30"]]);
        let out = compile_table_block(&table);
        assert!(out.contains("table.header("), "expected table.header(), got:\n{out}");
        assert!(out.contains("[Name]"), "expected [Name] cell, got:\n{out}");
    }

    #[test]
    fn table_body_cells_as_content_blocks() {
        let table = make_table(false, vec![vec!["hello", "world"]]);
        let out = compile_table_block(&table);
        assert!(out.contains("[hello]"), "expected [hello], got:\n{out}");
        assert!(out.contains("[world]"), "expected [world], got:\n{out}");
    }

    #[test]
    fn full_spike_compile() {
        let model = crate::model::spike_model();
        let source = compile(&model, None);
        assert!(source.contains("#let data = json(\"data.json\")"), "missing data binding");
        assert!(source.contains("Acme Corp"), "missing bold text");
        assert!(source.contains("#data.invoice.number"), "missing merge field");
        assert!(source.contains("data.invoice.status == \"paid\""), "missing condition");
        assert!(source.contains("for item in data.invoice.items"), "missing for loop");
        assert!(source.contains("#item.description"), "loop var should not use data. prefix");
    }
}
