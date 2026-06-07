use crate::model::*;

pub fn compile(model: &BlockModel) -> String {
    let preamble = preamble();
    let content = compile_blocks(&model.blocks, &[]);
    format!("#let data = json(\"data.json\")\n\n{preamble}\n\n{content}")
}

fn preamble() -> String {
    r#"#set page(paper: "a4", margin: (x: 2.5cm, y: 2cm))
#set text(font: "New Computer Modern", size: 11pt)
#set par(leading: 0.65em)"#
        .into()
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
    }
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

    #[test]
    fn full_spike_compile() {
        let model = crate::model::spike_model();
        let source = compile(&model);
        assert!(source.contains("#let data = json(\"data.json\")"), "missing data binding");
        assert!(source.contains("Acme Corp"), "missing bold text");
        assert!(source.contains("#data.invoice.number"), "missing merge field");
        assert!(source.contains("data.invoice.status == \"paid\""), "missing condition");
        assert!(source.contains("for item in data.invoice.items"), "missing for loop");
        assert!(source.contains("#item.description"), "loop var should not use data. prefix");
    }
}
