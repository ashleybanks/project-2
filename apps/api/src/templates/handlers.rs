use axum::{
    extract::{Extension, Multipart, Path, State},
    http::StatusCode,
    response::{IntoResponse, Json},
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

use crate::{AppState, AppError, auth::middleware::AuthUser};

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct TemplateSummary {
    pub id: Uuid,
    pub name: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Serialize)]
pub struct TemplateDetail {
    pub id: Uuid,
    pub name: String,
    pub block_model: serde_json::Value,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Deserialize)]
pub struct CreateRequest {
    pub name: String,
    #[serde(default = "empty_block_model")]
    pub block_model: serde_json::Value,
}

#[derive(Deserialize)]
pub struct UpdateRequest {
    pub name: Option<String>,
    pub block_model: Option<serde_json::Value>,
}

fn empty_block_model() -> serde_json::Value {
    json!({ "blocks": [] })
}

// ── Handlers ──────────────────────────────────────────────────────────────────

pub async fn list(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
) -> Result<Json<Vec<TemplateSummary>>, AppError> {
    let rows = sqlx::query!(
        "SELECT id, name, created_at, updated_at
         FROM templates
         WHERE user_id = $1
         ORDER BY updated_at DESC",
        user.user_id,
    )
    .fetch_all(&state.db)
    .await?;

    Ok(Json(
        rows.into_iter()
            .map(|r| TemplateSummary {
                id: r.id,
                name: r.name,
                created_at: r.created_at,
                updated_at: r.updated_at,
            })
            .collect(),
    ))
}

pub async fn create(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Json(body): Json<CreateRequest>,
) -> Result<impl IntoResponse, AppError> {
    let row = sqlx::query!(
        "INSERT INTO templates (user_id, name, block_model)
         VALUES ($1, $2, $3)
         RETURNING id, name, block_model, created_at, updated_at",
        user.user_id,
        body.name,
        body.block_model,
    )
    .fetch_one(&state.db)
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(TemplateDetail {
            id: row.id,
            name: row.name,
            block_model: row.block_model,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }),
    ))
}

pub async fn get_one(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(id): Path<Uuid>,
) -> Result<Json<TemplateDetail>, AppError> {
    let row = sqlx::query!(
        "SELECT id, name, block_model, created_at, updated_at
         FROM templates
         WHERE id = $1 AND user_id = $2",
        id,
        user.user_id,
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok(Json(TemplateDetail {
        id: row.id,
        name: row.name,
        block_model: row.block_model,
        created_at: row.created_at,
        updated_at: row.updated_at,
    }))
}

pub async fn update(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateRequest>,
) -> Result<Json<TemplateDetail>, AppError> {
    let row = sqlx::query!(
        "UPDATE templates
         SET name        = COALESCE($3, name),
             block_model = COALESCE($4, block_model),
             updated_at  = NOW()
         WHERE id = $1 AND user_id = $2
         RETURNING id, name, block_model, created_at, updated_at",
        id,
        user.user_id,
        body.name,
        body.block_model,
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok(Json(TemplateDetail {
        id: row.id,
        name: row.name,
        block_model: row.block_model,
        created_at: row.created_at,
        updated_at: row.updated_at,
    }))
}

pub async fn delete_one(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let result = sqlx::query!(
        "DELETE FROM templates WHERE id = $1 AND user_id = $2",
        id,
        user.user_id,
    )
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }

    Ok(StatusCode::NO_CONTENT)
}

pub async fn import_docx(
    State(_state): State<AppState>,
    Extension(_user): Extension<AuthUser>,
    mut multipart: Multipart,
) -> Result<Json<serde_json::Value>, AppError> {
    const MAX_SIZE: usize = 10 * 1024 * 1024; // 10MB

    while let Some(field) = multipart.next_field().await
        .map_err(|e| AppError::Internal(e.to_string()))?
    {
        let data = field.bytes().await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        if data.len() > MAX_SIZE {
            return Err(AppError::FileTooLarge);
        }

        let block_model = crate::docx::parse_docx(&data)
            .map_err(|e| AppError::DocxParseFailed(e.to_string()))?;

        return Ok(Json(block_model));
    }

    Err(AppError::Internal("No file in request".into()))
}
