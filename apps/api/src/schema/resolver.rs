use serde::{Deserialize, Serialize};
use tracing::{debug, info, warn};

use crate::schema::extractor::{ExtractedIntent, IntentKind};

// ── LLM response types ────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct OllamaResponse {
    message: OllamaMessage,
}

#[derive(Debug, Deserialize)]
struct OllamaMessage {
    content: String,
}

#[derive(Debug, Deserialize)]
struct MappingResult {
    intent_key: String,
    field_path: Option<String>,
    #[serde(default = "default_confidence")]
    confidence: String,
    #[serde(default)]
    alternatives: Vec<String>,
    #[serde(default)]
    display_name: String,
}

fn default_confidence() -> String {
    "unresolved".to_string()
}

// ── Public types ──────────────────────────────────────────────────────────────

/// The fields the LLM returns for each intent.
#[derive(Debug, Clone)]
pub struct ResolvedMapping {
    pub intent_key: String,
    pub field_path: Option<String>,
    pub confidence: String,
    pub alternatives: Vec<String>,
    pub display_name: String,
}

/// A full mapping row ready to upsert, combining LLM output with intent metadata.
#[derive(Debug, Clone)]
pub struct MappingRow {
    pub intent_key: String,
    pub intent_label: String,
    pub intent_type: String,
    pub parent_key: Option<String>,
    pub field_path: Option<String>,
    pub confidence: String,
    pub alternatives: Vec<String>,
    pub display_name: String,
}

// ── Resolution ────────────────────────────────────────────────────────────────

/// Resolve all intents against a JSON schema in a single LLM pass.
pub async fn resolve_all(
    ollama_base_url: &str,
    model: &str,
    schema: &serde_json::Value,
    intents: &[ExtractedIntent],
    existing_mappings: &[ResolvedMapping],
) -> anyhow::Result<Vec<ResolvedMapping>> {
    if intents.is_empty() {
        return Ok(vec![]);
    }
    let prompt = build_prompt(schema, intents, existing_mappings, None);
    call_llm(ollama_base_url, model, &prompt, intents).await
}

/// Re-resolve a single intent, using existing mappings as context.
pub async fn resolve_one(
    ollama_base_url: &str,
    model: &str,
    schema: &serde_json::Value,
    target_key: &str,
    all_intents: &[ExtractedIntent],
    existing_mappings: &[ResolvedMapping],
) -> anyhow::Result<Option<ResolvedMapping>> {
    let target = match all_intents.iter().find(|i| i.key == target_key) {
        Some(i) => i,
        None => return Ok(None),
    };
    let prompt = build_prompt(schema, std::slice::from_ref(target), existing_mappings, Some(target_key));
    let mut results = call_llm(ollama_base_url, model, &prompt, std::slice::from_ref(target)).await?;
    Ok(results.pop())
}

// ── Prompt construction ───────────────────────────────────────────────────────

fn build_prompt(
    schema: &serde_json::Value,
    intents: &[ExtractedIntent],
    existing: &[ResolvedMapping],
    target_key: Option<&str>,
) -> String {
    let schema_str = serde_json::to_string_pretty(schema).unwrap_or_default();

    let intents_str = intents
        .iter()
        .map(|i| {
            let type_label = match i.intent_type {
                IntentKind::Field => "field",
                IntentKind::Repeat => "repeat (collection)",
                IntentKind::Condition => "condition",
            };
            let parent = i
                .parent_key
                .as_deref()
                .map(|k| format!(" [nested inside repeat section '{k}']"))
                .unwrap_or_default();
            format!(
                "  - key: {}\n    label: \"{}\"\n    type: {}{}",
                i.key, i.label, type_label, parent
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    let existing_str = if existing.is_empty() {
        String::new()
    } else {
        let lines = existing
            .iter()
            .map(|m| {
                format!(
                    "  - {} → {}",
                    m.intent_key,
                    m.field_path.as_deref().unwrap_or("(unresolved)")
                )
            })
            .collect::<Vec<_>>()
            .join("\n");
        format!("\nAlready resolved (do not duplicate paths):\n{lines}\n")
    };

    let focus = target_key
        .map(|k| format!("\nFocus on resolving intent key: {k}\n"))
        .unwrap_or_default();

    format!(
        r#"/no_think

You are resolving template intent labels to JSON Schema field paths.

JSON Schema:
{schema_str}

Intents to resolve:
{intents_str}
{existing_str}{focus}
Rules:
- For "field" intents: provide an absolute dot-notation path from the schema root (e.g. "customer.name")
- For "repeat" intents: provide the path to the array field (e.g. "invoice.items")
- For "condition" intents: provide a condition expression (e.g. "invoice.status == \"paid\"")
- For field intents nested inside a repeat section: provide the path relative to the collection item (e.g. "description", not "invoice.items[].description")
- If you cannot find a good match, set field_path to null and confidence to "unresolved"
- Provide up to 3 alternatives when confidence is not "high"
- display_name should be a concise, human-readable label

Return a JSON array, one object per intent:
[
  {{
    "intent_key": "...",
    "field_path": "..." | null,
    "confidence": "high" | "medium" | "low" | "unresolved",
    "alternatives": [],
    "display_name": "..."
  }}
]

Return only the JSON array, no other text."#
    )
}

// ── LLM call ──────────────────────────────────────────────────────────────────

async fn call_llm(
    ollama_base_url: &str,
    model: &str,
    prompt: &str,
    intents: &[ExtractedIntent],
) -> anyhow::Result<Vec<ResolvedMapping>> {
    let client = reqwest::Client::new();

    #[derive(Serialize)]
    struct ChatRequest<'a> {
        model: &'a str,
        messages: Vec<ChatMessage<'a>>,
        stream: bool,
        format: &'a str,
        options: ChatOptions,
    }
    #[derive(Serialize)]
    struct ChatMessage<'a> {
        role: &'a str,
        content: &'a str,
    }
    #[derive(Serialize)]
    struct ChatOptions {
        temperature: f32,
    }

    let req = ChatRequest {
        model,
        messages: vec![ChatMessage { role: "user", content: prompt }],
        stream: false,
        format: "json",
        options: ChatOptions { temperature: 0.1 },
    };

    let url = format!("{ollama_base_url}/api/chat");
    info!(model, %url, intent_count = intents.len(), "Sending resolution request to Ollama");
    debug!("Prompt:\n{prompt}");

    let resp = client
        .post(&url)
        .json(&req)
        .timeout(std::time::Duration::from_secs(120))
        .send()
        .await
        .map_err(|e| anyhow::anyhow!("Ollama request failed: {e}"))?;

    let status = resp.status();
    info!(%status, "Ollama response received");

    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        warn!(%status, body = %body, "Ollama returned an error");
        return Err(anyhow::anyhow!("Ollama error {status}: {body}"));
    }

    let ollama_resp: OllamaResponse = resp
        .json()
        .await
        .map_err(|e| anyhow::anyhow!("Failed to parse Ollama response: {e}"))?;

    // Parse JSON array from content — strip markdown fences if present
    let content = ollama_resp.message.content.trim().to_string();
    debug!("Raw LLM content:\n{content}");
    let json_str = strip_markdown_fences(&content);

    // The model sometimes returns a bare object instead of a single-element array.
    let normalised = json_str.trim();
    let normalised = if normalised.starts_with('{') {
        format!("[{normalised}]")
    } else {
        normalised.to_string()
    };

    let raw: Vec<MappingResult> = serde_json::from_str(&normalised)
        .map_err(|e| {
            warn!(error = %e, raw = %normalised, "Failed to parse mapping JSON from LLM");
            anyhow::anyhow!("Failed to parse mapping JSON: {e}\nContent: {normalised}")
        })?;

    // Build a fallback for any intents the LLM didn't return
    let mut results: Vec<ResolvedMapping> = raw
        .into_iter()
        .map(|r| ResolvedMapping {
            intent_key: r.intent_key,
            field_path: r.field_path,
            confidence: normalise_confidence(&r.confidence),
            alternatives: r.alternatives.into_iter().take(3).collect(),
            display_name: r.display_name,
        })
        .collect();

    // Add unresolved fallbacks for any intents the LLM missed
    let returned_keys: std::collections::HashSet<String> =
        results.iter().map(|r| r.intent_key.clone()).collect();
    for intent in intents {
        if !returned_keys.contains(&intent.key) {
            results.push(ResolvedMapping {
                intent_key: intent.key.clone(),
                field_path: None,
                confidence: "unresolved".to_string(),
                alternatives: vec![],
                display_name: intent.label.clone(),
            });
        }
    }

    Ok(results)
}

fn normalise_confidence(s: &str) -> String {
    match s.to_lowercase().as_str() {
        "high" => "high",
        "medium" => "medium",
        "low" => "low",
        _ => "unresolved",
    }
    .to_string()
}

fn strip_markdown_fences(s: &str) -> &str {
    let s = s.trim();
    if let Some(inner) = s.strip_prefix("```json").or_else(|| s.strip_prefix("```")) {
        inner
            .trim_start()
            .strip_suffix("```")
            .map(|t| t.trim())
            .unwrap_or(inner.trim())
    } else {
        s
    }
}
