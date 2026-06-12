use axum::{
    extract::{Extension, Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Json},
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

use crate::{AppError, AppState, auth::middleware::AuthUser};
use super::extractor::{extract_intents, ExtractedIntent, IntentKind};
use super::resolver::{resolve_all, resolve_one, MappingRow, ResolvedMapping};

// ── Response types ────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct SchemaResponse {
    pub id: Uuid,
    pub template_id: Uuid,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub raw_schema: serde_json::Value,
    pub mappings: Vec<MappingResponse>,
    /// True when resolution is still running (mappings may be incomplete)
    pub resolving: bool,
}

#[derive(Serialize, Clone)]
pub struct MappingResponse {
    pub id: Uuid,
    pub schema_id: Uuid,
    pub intent_key: String,
    pub intent_label: String,
    pub intent_type: String,
    pub display_name: String,
    pub field_path: Option<String>,
    pub confidence: String,
    pub alternatives: Vec<String>,
    pub parent_key: Option<String>,
}

// ── Request types ─────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct ResolveRequest {
    pub intent_key: Option<String>,
}

#[derive(Deserialize)]
pub struct PatchMappingRequest {
    pub field_path: Option<String>,
    pub display_name: Option<String>,
}

#[derive(Deserialize)]
pub struct TestDataQuery {
    #[serde(default = "default_count")]
    pub count: usize,
}
fn default_count() -> usize { 10 }

// ── DB helpers ────────────────────────────────────────────────────────────────

async fn assert_owner(db: &sqlx::PgPool, template_id: Uuid, user_id: Uuid) -> Result<(), AppError> {
    sqlx::query_scalar!(
        "SELECT id FROM templates WHERE id = $1 AND user_id = $2",
        template_id, user_id,
    )
    .fetch_optional(db)
    .await?
    .ok_or(AppError::NotFound)?;
    Ok(())
}

struct SchemaRow {
    id: Uuid,
    raw_schema: serde_json::Value,
    created_at: chrono::DateTime<chrono::Utc>,
}

async fn load_schema(db: &sqlx::PgPool, template_id: Uuid) -> Result<Option<SchemaRow>, AppError> {
    let row = sqlx::query!(
        "SELECT id, raw_schema, created_at FROM template_schemas WHERE template_id = $1",
        template_id,
    )
    .fetch_optional(db)
    .await?;
    Ok(row.map(|r| SchemaRow { id: r.id, raw_schema: r.raw_schema, created_at: r.created_at }))
}

async fn load_mappings(db: &sqlx::PgPool, schema_id: Uuid) -> Result<Vec<MappingResponse>, AppError> {
    let rows = sqlx::query!(
        r#"SELECT id, schema_id, intent_key, intent_label,
                  intent_type, display_name, field_path,
                  confidence, alternatives, parent_key
           FROM intent_mappings WHERE schema_id = $1 ORDER BY id"#,
        schema_id,
    )
    .fetch_all(db)
    .await?;

    Ok(rows.into_iter().map(|r| MappingResponse {
        id: r.id,
        schema_id: r.schema_id,
        intent_key: r.intent_key,
        intent_label: r.intent_label,
        intent_type: r.intent_type,
        display_name: r.display_name,
        field_path: r.field_path,
        confidence: r.confidence,
        alternatives: r.alternatives,
        parent_key: r.parent_key,
    }).collect())
}

async fn upsert_mappings(db: &sqlx::PgPool, schema_id: Uuid, rows: &[MappingRow]) -> Result<(), AppError> {
    for m in rows {
        sqlx::query!(
            r#"INSERT INTO intent_mappings
                 (schema_id, intent_key, intent_label, intent_type, display_name,
                  field_path, confidence, alternatives, parent_key)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
               ON CONFLICT (schema_id, intent_key) DO UPDATE
                 SET display_name = EXCLUDED.display_name,
                     field_path   = EXCLUDED.field_path,
                     confidence   = EXCLUDED.confidence,
                     alternatives = EXCLUDED.alternatives"#,
            schema_id,
            m.intent_key, m.intent_label, m.intent_type.as_str(),
            m.display_name, m.field_path, m.confidence.as_str(),
            &m.alternatives, m.parent_key,
        )
        .execute(db)
        .await?;
    }
    Ok(())
}

/// Write resolved field_path / collection_path back onto the block model JSON.
async fn write_back_to_block_model(
    db: &sqlx::PgPool,
    template_id: Uuid,
    rows: &[MappingRow],
) -> Result<(), AppError> {
    let mut block_model = sqlx::query_scalar!(
        "SELECT block_model FROM templates WHERE id = $1",
        template_id,
    )
    .fetch_one(db)
    .await?;

    for m in rows {
        if let Some(fp) = &m.field_path {
            patch_intent_node(&mut block_model, &m.intent_key, &m.intent_type, fp, &m.display_name);
        }
    }

    sqlx::query!(
        "UPDATE templates SET block_model = $2, updated_at = NOW() WHERE id = $1",
        template_id, block_model,
    )
    .execute(db)
    .await?;
    Ok(())
}

fn patch_intent_node(
    value: &mut serde_json::Value,
    target_key: &str,
    intent_type: &str,
    field_path: &str,
    display_name: &str,
) {
    match value {
        serde_json::Value::Array(arr) => {
            for item in arr.iter_mut() {
                patch_intent_node(item, target_key, intent_type, field_path, display_name);
            }
        }
        serde_json::Value::Object(obj) => {
            let matches = obj.get("_key").and_then(|v| v.as_str()) == Some(target_key);
            if matches {
                if intent_type == "field" {
                    obj.insert("field_path".into(), json!(field_path));
                } else {
                    obj.insert("collection_path".into(), json!(field_path));
                }
                if !display_name.is_empty() {
                    obj.insert("display_name".into(), json!(display_name));
                }
                return;
            }
            for v in obj.values_mut() {
                patch_intent_node(v, target_key, intent_type, field_path, display_name);
            }
        }
        _ => {}
    }
}

// ── Resolution logic ──────────────────────────────────────────────────────────

fn intent_type_str(kind: &IntentKind) -> &'static str {
    match kind {
        IntentKind::Field => "field",
        IntentKind::Repeat => "repeat",
        IntentKind::Condition => "condition",
    }
}

fn merge_into_rows(intents: &[ExtractedIntent], resolved: &[ResolvedMapping]) -> Vec<MappingRow> {
    resolved.iter().filter_map(|r| {
        let intent = intents.iter().find(|i| i.key == r.intent_key)?;
        Some(MappingRow {
            intent_key: r.intent_key.clone(),
            intent_label: intent.label.clone(),
            intent_type: intent_type_str(&intent.intent_type).to_string(),
            parent_key: intent.parent_key.clone(),
            field_path: r.field_path.clone(),
            confidence: r.confidence.clone(),
            alternatives: r.alternatives.clone(),
            display_name: if r.display_name.is_empty() { intent.label.clone() } else { r.display_name.clone() },
        })
    }).collect()
}

fn apply_conflict_detection(rows: &mut [MappingRow]) {
    use std::collections::HashMap;
    let mut counts: HashMap<String, usize> = HashMap::new();
    for m in rows.iter() {
        if let Some(fp) = &m.field_path {
            *counts.entry(fp.clone()).or_insert(0) += 1;
        }
    }
    for m in rows.iter_mut() {
        if let Some(fp) = &m.field_path {
            if counts.get(fp).copied().unwrap_or(0) > 1
                && m.confidence != "low"
                && m.confidence != "unresolved"
            {
                m.confidence = "low".to_string();
            }
        }
    }
}

async fn run_resolution(
    db: &sqlx::PgPool,
    ollama: &str,
    model: &str,
    schema_id: Uuid,
    template_id: Uuid,
    raw_schema: &serde_json::Value,
    block_model: &serde_json::Value,
    target_key: Option<&str>,
) -> anyhow::Result<()> {
    let top_level_count = block_model
        .get("blocks")
        .and_then(|v| v.as_array())
        .map(|a| a.len())
        .unwrap_or(0);
    tracing::debug!(%schema_id, top_level_blocks = top_level_count, "block_model snapshot");

    let all_intents = extract_intents(block_model);
    tracing::info!(
        %schema_id, %template_id,
        intent_count = all_intents.len(),
        target_key = target_key.unwrap_or("(all)"),
        "Starting resolution"
    );
    if !all_intents.is_empty() {
        for i in &all_intents {
            tracing::debug!(key = %i.key, label = %i.label, kind = ?i.intent_type, "extracted intent");
        }
    }
    if all_intents.is_empty() {
        tracing::warn!(%schema_id, block_model = %block_model, "No intents found — block_model dump");
        return Ok(());
    }

    // Load existing mappings as context (for selective re-resolution)
    let existing_rows = sqlx::query!(
        r#"SELECT intent_key, field_path, confidence,
                  alternatives, display_name
           FROM intent_mappings WHERE schema_id = $1"#,
        schema_id,
    )
    .fetch_all(db)
    .await?;

    let existing_context: Vec<ResolvedMapping> = existing_rows.iter().map(|r| ResolvedMapping {
        intent_key: r.intent_key.clone(),
        field_path: r.field_path.clone(),
        confidence: r.confidence.clone(),
        alternatives: r.alternatives.clone(),
        display_name: r.display_name.clone(),
    }).collect();

    let resolved = match target_key {
        Some(key) => resolve_one(ollama, model, raw_schema, key, &all_intents, &existing_context)
            .await?
            .into_iter()
            .collect(),
        None => resolve_all(ollama, model, raw_schema, &all_intents, &existing_context).await?,
    };

    let mut rows = merge_into_rows(&all_intents, &resolved);
    apply_conflict_detection(&mut rows);
    upsert_mappings(db, schema_id, &rows).await?;
    write_back_to_block_model(db, template_id, &rows).await?;

    tracing::info!(%schema_id, mapped = rows.len(), "Resolution complete");
    Ok(())
}

// ── HTTP handlers ─────────────────────────────────────────────────────────────

/// POST /api/templates/{id}/schema
pub async fn upload_schema(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(template_id): Path<Uuid>,
    Json(raw_schema): Json<serde_json::Value>,
) -> Result<impl IntoResponse, AppError> {
    assert_owner(&state.db, template_id, user.user_id).await?;

    if raw_schema.get("type").and_then(|v| v.as_str()) != Some("object") {
        return Err(AppError::Internal(
            "The schema must describe an object (root type must be \"object\")".into(),
        ));
    }

    let schema_id = sqlx::query_scalar!(
        r#"INSERT INTO template_schemas (template_id, raw_schema)
           VALUES ($1, $2)
           ON CONFLICT (template_id) DO UPDATE
             SET raw_schema = EXCLUDED.raw_schema, created_at = NOW()
           RETURNING id"#,
        template_id, raw_schema,
    )
    .fetch_one(&state.db)
    .await?;

    // Clear stale mappings from previous schema
    sqlx::query!("DELETE FROM intent_mappings WHERE schema_id = $1", schema_id)
        .execute(&state.db)
        .await?;

    let block_model = sqlx::query_scalar!(
        "SELECT block_model FROM templates WHERE id = $1", template_id,
    )
    .fetch_one(&state.db)
    .await?;

    let created_at = sqlx::query_scalar!(
        "SELECT created_at FROM template_schemas WHERE id = $1", schema_id,
    )
    .fetch_one(&state.db)
    .await?;

    // Spawn background resolution
    let (db, ollama, model) = (state.db.clone(), state.ollama_base_url.clone(), state.ollama_model.clone());
    let schema_clone = raw_schema.clone();
    let resolving_schemas = state.resolving_schemas.clone();
    resolving_schemas.write().unwrap().insert(schema_id);
    tokio::spawn(async move {
        if let Err(e) = run_resolution(&db, &ollama, &model, schema_id, template_id, &schema_clone, &block_model, None).await {
            tracing::warn!("Schema resolution failed for {schema_id}: {e}");
        }
        resolving_schemas.write().unwrap().remove(&schema_id);
    });

    Ok((StatusCode::CREATED, Json(SchemaResponse {
        id: schema_id,
        template_id,
        created_at,
        raw_schema,
        mappings: vec![],
        resolving: true,
    })))
}

/// GET /api/templates/{id}/schema
pub async fn get_schema(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(template_id): Path<Uuid>,
) -> Result<Json<SchemaResponse>, AppError> {
    assert_owner(&state.db, template_id, user.user_id).await?;
    let s = load_schema(&state.db, template_id).await?.ok_or(AppError::NotFound)?;
    let mappings = load_mappings(&state.db, s.id).await?;
    let resolving = state.resolving_schemas.read().unwrap().contains(&s.id);
    Ok(Json(SchemaResponse {
        id: s.id, template_id, created_at: s.created_at,
        raw_schema: s.raw_schema, mappings, resolving,
    }))
}

/// DELETE /api/templates/{id}/schema
pub async fn delete_schema(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(template_id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    assert_owner(&state.db, template_id, user.user_id).await?;
    let deleted = sqlx::query!(
        "DELETE FROM template_schemas WHERE template_id = $1 RETURNING id",
        template_id,
    )
    .fetch_optional(&state.db)
    .await?;
    if deleted.is_none() { return Err(AppError::NotFound); }
    Ok(StatusCode::NO_CONTENT)
}

/// POST /api/templates/{id}/schema/resolve
pub async fn trigger_resolve(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(template_id): Path<Uuid>,
    Json(body): Json<ResolveRequest>,
) -> Result<StatusCode, AppError> {
    assert_owner(&state.db, template_id, user.user_id).await?;
    let s = load_schema(&state.db, template_id).await?.ok_or(AppError::NotFound)?;
    let block_model = sqlx::query_scalar!(
        "SELECT block_model FROM templates WHERE id = $1", template_id,
    )
    .fetch_one(&state.db)
    .await?;

    let (db, ollama, model) = (state.db.clone(), state.ollama_base_url.clone(), state.ollama_model.clone());
    let target_key = body.intent_key.clone();
    let raw_schema = s.raw_schema.clone();
    let schema_id = s.id;
    let resolving_schemas = state.resolving_schemas.clone();
    resolving_schemas.write().unwrap().insert(schema_id);
    tokio::spawn(async move {
        if let Err(e) = run_resolution(&db, &ollama, &model, schema_id, template_id, &raw_schema, &block_model, target_key.as_deref()).await {
            tracing::warn!("Resolution failed: {e}");
        }
        resolving_schemas.write().unwrap().remove(&schema_id);
    });

    Ok(StatusCode::ACCEPTED)
}

/// PATCH /api/templates/{id}/schema/mappings/{intent_key}
pub async fn patch_mapping(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path((template_id, intent_key)): Path<(Uuid, String)>,
    Json(body): Json<PatchMappingRequest>,
) -> Result<Json<MappingResponse>, AppError> {
    assert_owner(&state.db, template_id, user.user_id).await?;
    let s = load_schema(&state.db, template_id).await?.ok_or(AppError::NotFound)?;

    let row = sqlx::query!(
        r#"UPDATE intent_mappings
           SET field_path   = COALESCE($3, field_path),
               display_name = COALESCE($4, display_name),
               confidence   = CASE WHEN $3 IS NOT NULL THEN 'high' ELSE confidence END
           WHERE schema_id = $1 AND intent_key = $2
           RETURNING id, schema_id, intent_key, intent_label,
                     intent_type, display_name, field_path,
                     confidence, alternatives, parent_key"#,
        s.id, intent_key, body.field_path, body.display_name,
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    // Write field_path back to block model if changed
    if let Some(fp) = &body.field_path {
        let intent_type = row.intent_type.as_str();
        let display_name = row.display_name.as_str();
        let mut block_model = sqlx::query_scalar!(
            "SELECT block_model FROM templates WHERE id = $1", template_id,
        ).fetch_one(&state.db).await?;
        patch_intent_node(&mut block_model, &intent_key, intent_type, fp, display_name);
        sqlx::query!(
            "UPDATE templates SET block_model = $2, updated_at = NOW() WHERE id = $1",
            template_id, block_model,
        ).execute(&state.db).await?;
    }

    Ok(Json(MappingResponse {
        id: row.id,
        schema_id: row.schema_id,
        intent_key: row.intent_key,
        intent_label: row.intent_label,
        intent_type: row.intent_type,
        display_name: row.display_name,
        field_path: row.field_path,
        confidence: row.confidence,
        alternatives: row.alternatives,
        parent_key: row.parent_key,
    }))
}

/// POST /api/templates/{id}/schema/test-data?count=10
pub async fn generate_test_data(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(template_id): Path<Uuid>,
    Query(q): Query<TestDataQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    assert_owner(&state.db, template_id, user.user_id).await?;
    let s = load_schema(&state.db, template_id).await?.ok_or(AppError::NotFound)?;
    let records = super::test_data::generate_records(&s.raw_schema, q.count.clamp(1, 100));
    Ok(Json(json!(records)))
}
