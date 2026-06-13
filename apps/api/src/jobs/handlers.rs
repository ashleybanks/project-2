use axum::{
    body::Body,
    extract::{Extension, Path, State},
    http::{header, StatusCode},
    response::{IntoResponse, Json, Response},
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

use crate::{AppError, AppState, auth::middleware::AuthUser};
use super::render::run_render_job;

// ── Request / response types ──────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct GenerateRequest {
    pub payload: serde_json::Value,
}

#[derive(Serialize)]
pub struct JobStatusResponse {
    pub id: Uuid,
    pub status: String,
    pub error_message: Option<String>,
    pub download_url: Option<String>,
}

// ── Handlers ──────────────────────────────────────────────────────────────────

/// POST /api/templates/{id}/generate
pub async fn generate(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(template_id): Path<Uuid>,
    Json(body): Json<GenerateRequest>,
) -> Result<impl IntoResponse, AppError> {
    // Verify template ownership
    let template = sqlx::query!(
        "SELECT id FROM templates WHERE id = $1 AND user_id = $2",
        template_id,
        user.user_id,
    )
    .fetch_optional(&state.db)
    .await?;

    if template.is_none() {
        return Err(AppError::NotFound);
    }

    // Validate payload against schema if one exists
    let schema_row = sqlx::query!(
        "SELECT raw_schema FROM template_schemas WHERE template_id = $1",
        template_id,
    )
    .fetch_optional(&state.db)
    .await?;

    if let Some(schema_row) = schema_row {
        let schema: serde_json::Value = schema_row.raw_schema;
        let validator = jsonschema::validator_for(&schema)
            .map_err(|e| AppError::Internal(format!("Invalid schema: {e}")))?;

        let errors: Vec<serde_json::Value> = validator
            .iter_errors(&body.payload)
            .map(|e| {
                let field = e.instance_path.to_string();
                let field = if field.is_empty() {
                    "payload".to_string()
                } else {
                    field.trim_start_matches('/').replace('/', ".").to_string()
                };
                json!({ "field": field, "message": e.to_string() })
            })
            .collect();

        if !errors.is_empty() {
            return Ok((
                StatusCode::UNPROCESSABLE_ENTITY,
                Json(json!({ "errors": errors })),
            )
                .into_response());
        }
    }

    // Insert job
    let job_id = sqlx::query_scalar!(
        "INSERT INTO jobs (template_id, user_id, payload) VALUES ($1, $2, $3) RETURNING id",
        template_id,
        user.user_id,
        body.payload,
    )
    .fetch_one(&state.db)
    .await?;

    // Spawn render in background
    let state_clone = state.clone();
    tokio::spawn(async move {
        run_render_job(state_clone, job_id).await;
    });

    Ok((StatusCode::ACCEPTED, Json(json!({ "job_id": job_id }))).into_response())
}

/// GET /api/jobs/{id}
pub async fn get_job(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(job_id): Path<Uuid>,
) -> Result<Json<JobStatusResponse>, AppError> {
    let row = sqlx::query!(
        "SELECT id, status, error_message FROM jobs WHERE id = $1 AND user_id = $2",
        job_id,
        user.user_id,
    )
    .fetch_optional(&state.db)
    .await?;

    let row = row.ok_or_else(|| AppError::NotFound)?;

    let download_url = if row.status == "done" {
        Some(format!("/api/jobs/{}/download", row.id))
    } else {
        None
    };

    Ok(Json(JobStatusResponse {
        id: row.id,
        status: row.status,
        error_message: row.error_message,
        download_url,
    }))
}

/// GET /api/jobs/{id}/download
pub async fn download(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(job_id): Path<Uuid>,
) -> Result<Response, AppError> {
    // Check ownership and status
    let job = sqlx::query!(
        "SELECT status FROM jobs WHERE id = $1 AND user_id = $2",
        job_id,
        user.user_id,
    )
    .fetch_optional(&state.db)
    .await?;

    let job = job.ok_or_else(|| AppError::NotFound)?;

    if job.status != "done" {
        return Ok((
            StatusCode::CONFLICT,
            Json(json!({ "error": "Document is not yet ready", "status": job.status })),
        )
            .into_response());
    }

    let doc = sqlx::query!(
        "SELECT pdf_bytes FROM generated_documents WHERE job_id = $1",
        job_id,
    )
    .fetch_optional(&state.db)
    .await?;

    let doc = doc.ok_or_else(|| AppError::NotFound)?;

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/pdf")
        .header(
            header::CONTENT_DISPOSITION,
            "attachment; filename=\"document.pdf\"",
        )
        .body(Body::from(doc.pdf_bytes))
        .unwrap())
}
