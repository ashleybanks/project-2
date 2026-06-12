use serde::Deserialize;

// ── Stylesheet ────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct StylesheetDef {
    pub heading_font: Option<String>,
    pub body_font: Option<String>,
    pub heading_colour: Option<String>,
    pub body_colour: Option<String>,
    pub normal: Option<ParagraphStyle>,
    pub h1: Option<ParagraphStyle>,
    pub h2: Option<ParagraphStyle>,
    pub h3: Option<ParagraphStyle>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ParagraphStyle {
    pub font_size: Option<f64>,
    pub spacing_before: Option<f64>,
    pub spacing_after: Option<f64>,
}

// ── Block model ───────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct BlockModel {
    pub blocks: Vec<Block>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Block {
    Text(TextBlock),
    Repeating(RepeatingBlock),
    Conditional(ConditionalBlock),
    Table(TableBlock),
}

#[derive(Debug, Deserialize)]
pub struct TableBlock {
    pub rows: Vec<TableRow>,
}

#[derive(Debug, Deserialize)]
pub struct TableRow {
    pub cells: Vec<TableCell>,
    #[serde(default)]
    pub is_header: bool,
}

#[derive(Debug, Deserialize)]
pub struct TableCell {
    pub content: Vec<PtBlock>,
}

#[derive(Debug, Deserialize)]
pub struct TextBlock {
    pub style_class: Option<String>,
    pub content: PortableTextDoc,
}

#[derive(Debug, Deserialize)]
pub struct RepeatingBlock {
    /// Dot-path into the payload array, e.g. "invoice.items"
    pub field: String,
    pub blocks: Vec<Block>,
    pub empty_state: Option<Vec<Block>>,
}

#[derive(Debug, Deserialize)]
pub struct ConditionalBlock {
    pub condition: ConditionTree,
    pub blocks: Vec<Block>,
}

// ── Portable Text ─────────────────────────────────────────────────────────────

pub type PortableTextDoc = Vec<PtBlock>;

#[derive(Debug, Deserialize)]
pub struct PtBlock {
    #[serde(rename = "_type")]
    pub block_type: String,
    pub style: Option<String>,
    pub children: Vec<PtChild>,
    #[serde(rename = "listItem", default)]
    pub list_item: Option<String>,
    #[serde(default)]
    pub level: Option<u32>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "_type", rename_all = "camelCase")]
pub enum PtChild {
    Span(PtSpan),
    MergeField(PtMergeField),
}

#[derive(Debug, Deserialize)]
pub struct PtSpan {
    pub text: String,
    #[serde(default)]
    pub marks: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct PtMergeField {
    pub field: String,
}

// ── Condition tree ─────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ConditionTree {
    Eq(BinaryCondition),
    Ne(BinaryCondition),
    Gt(BinaryCondition),
    Lt(BinaryCondition),
    Gte(BinaryCondition),
    Lte(BinaryCondition),
    IsEmpty { field: String },
    IsNotEmpty { field: String },
    HasItems { field: String },
    All { conditions: Vec<ConditionTree> },
    Any { conditions: Vec<ConditionTree> },
}

#[derive(Debug, Deserialize)]
pub struct BinaryCondition {
    pub field: String,
    pub value: serde_json::Value,
}

pub fn spike_model() -> BlockModel {
    BlockModel {
        blocks: vec![
            Block::Text(TextBlock {
                style_class: Some("body".into()),
                content: vec![PtBlock {
                    block_type: "block".into(),
                    style: Some("normal".into()),
                    list_item: None,
                    level: None,
                    children: vec![
                        PtChild::Span(PtSpan {
                            text: "Invoice for ".into(),
                            marks: vec![],
                        }),
                        PtChild::Span(PtSpan {
                            text: "Acme Corp".into(),
                            marks: vec!["strong".into()],
                        }),
                        PtChild::Span(PtSpan {
                            text: " — ref: ".into(),
                            marks: vec![],
                        }),
                        PtChild::MergeField(PtMergeField {
                            field: "invoice.number".into(),
                        }),
                    ],
                }],
            }),
            Block::Repeating(RepeatingBlock {
                field: "invoice.items".into(),
                blocks: vec![Block::Text(TextBlock {
                    style_class: None,
                    content: vec![PtBlock {
                        block_type: "block".into(),
                        style: Some("normal".into()),
                        list_item: None,
                        level: None,
                        children: vec![
                            PtChild::MergeField(PtMergeField {
                                field: "item.description".into(),
                            }),
                            PtChild::Span(PtSpan {
                                text: ": £".into(),
                                marks: vec![],
                            }),
                            PtChild::MergeField(PtMergeField {
                                field: "item.unit_price".into(),
                            }),
                        ],
                    }],
                })],
                empty_state: Some(vec![Block::Text(TextBlock {
                    style_class: None,
                    content: vec![PtBlock {
                        block_type: "block".into(),
                        style: Some("normal".into()),
                        list_item: None,
                        level: None,
                        children: vec![PtChild::Span(PtSpan {
                            text: "No items on this invoice.".into(),
                            marks: vec![],
                        })],
                    }],
                })]),
            }),
            Block::Conditional(ConditionalBlock {
                condition: ConditionTree::Eq(BinaryCondition {
                    field: "invoice.status".into(),
                    value: serde_json::Value::String("paid".into()),
                }),
                blocks: vec![Block::Text(TextBlock {
                    style_class: None,
                    content: vec![PtBlock {
                        block_type: "block".into(),
                        style: Some("normal".into()),
                        list_item: None,
                        level: None,
                        children: vec![PtChild::Span(PtSpan {
                            text: "Payment received. Thank you.".into(),
                            marks: vec![],
                        })],
                    }],
                })],
            }),
        ],
    }
}
