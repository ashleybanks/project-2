use serde::Serialize;

/// A single intent extracted from the block model, with structural context.
#[derive(Debug, Clone, Serialize)]
pub struct ExtractedIntent {
    pub key: String,
    pub label: String,
    pub intent_type: IntentKind,
    /// _key of the parent repeat section (if this field intent is nested inside one)
    pub parent_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum IntentKind {
    Field,
    Repeat,
    Condition,
}

/// Walk the block model JSON and return all intents in document order,
/// with `parent_key` set for field intents nested inside repeat sections.
pub fn extract_intents(block_model: &serde_json::Value) -> Vec<ExtractedIntent> {
    let mut out = Vec::new();
    if let Some(blocks) = block_model.get("blocks").and_then(|v| v.as_array()) {
        for block in blocks {
            walk_top_level(block, None, &mut out);
        }
    }
    out
}

fn walk_top_level(
    node: &serde_json::Value,
    repeat_parent: Option<&str>,
    out: &mut Vec<ExtractedIntent>,
) {
    let node_type = node.get("_type").and_then(|v| v.as_str()).unwrap_or("");
    let key = node.get("_key").and_then(|v| v.as_str()).unwrap_or("").to_string();

    match node_type {
        "block" => {
            // Walk children for fieldIntent nodes
            if let Some(children) = node.get("children").and_then(|v| v.as_array()) {
                for child in children {
                    if child.get("_type").and_then(|v| v.as_str()) == Some("fieldIntent") {
                        let child_key = child
                            .get("_key")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();
                        let label = child
                            .get("label")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();
                        if !label.is_empty() {
                            out.push(ExtractedIntent {
                                key: child_key,
                                label,
                                intent_type: IntentKind::Field,
                                parent_key: repeat_parent.map(|s| s.to_string()),
                            });
                        }
                    }
                }
            }
        }
        "section" => {
            let repeat_intent = node
                .get("repeatIntent")
                .and_then(|v| v.as_str());
            let condition_intent = node
                .get("conditionIntent")
                .and_then(|v| v.as_str());

            if let Some(label) = repeat_intent {
                out.push(ExtractedIntent {
                    key: key.clone(),
                    label: label.to_string(),
                    intent_type: IntentKind::Repeat,
                    parent_key: None,
                });
                // Children of a repeat section resolve relative to its items
                if let Some(content) = node.get("content").and_then(|v| v.as_array()) {
                    for item in content {
                        walk_top_level(item, Some(&key), out);
                    }
                }
            } else if let Some(label) = condition_intent {
                out.push(ExtractedIntent {
                    key: key.clone(),
                    label: label.to_string(),
                    intent_type: IntentKind::Condition,
                    parent_key: None,
                });
                // Field intents inside a condition section resolve against root schema
                if let Some(content) = node.get("content").and_then(|v| v.as_array()) {
                    for item in content {
                        walk_top_level(item, repeat_parent, out);
                    }
                }
            } else {
                // Section with no intent — recurse
                if let Some(content) = node.get("content").and_then(|v| v.as_array()) {
                    for item in content {
                        walk_top_level(item, repeat_parent, out);
                    }
                }
            }
        }
        "table" => {
            if let Some(rows) = node.get("rows").and_then(|v| v.as_array()) {
                for row in rows {
                    if let Some(cells) = row.get("cells").and_then(|v| v.as_array()) {
                        for cell in cells {
                            if let Some(content) = cell.get("content").and_then(|v| v.as_array()) {
                                for block in content {
                                    walk_top_level(block, repeat_parent, out);
                                }
                            }
                        }
                    }
                }
            }
        }
        _ => {}
    }
}
