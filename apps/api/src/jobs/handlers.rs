use axum::{
    body::Body,
    extract::{Extension, Path, State},
    http::{header, StatusCode},
    response::{IntoResponse, Json, Response},
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::io::{Cursor, Write};
use uuid::Uuid;
use zip::{write::SimpleFileOptions, CompressionMethod, ZipWriter};

use crate::{AppError, AppState, auth::middleware::AuthUser};
use super::render::run_render_item;

// ── Request / response types ──────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct CreateJobRequest {
    pub records: Vec<serde_json::Value>,
}

#[derive(Serialize)]
pub struct JobItemResponse {
    pub id: Uuid,
    pub record_index: i32,
    pub record_id: Option<String>,
    pub status: String,
    pub error_message: Option<String>,
    pub payload: serde_json::Value,
}

#[derive(Serialize)]
pub struct JobResponse {
    pub id: Uuid,
    pub name: String,
    pub status: String,
    pub is_active: bool,
    pub total_count: i32,
    pub done_count: i32,
    pub failed_count: i32,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub completed_at: Option<chrono::DateTime<chrono::Utc>>,
    pub items: Vec<JobItemResponse>,
}

#[derive(Serialize)]
pub struct JobSummary {
    pub id: Uuid,
    pub name: String,
    pub status: String,
    pub is_active: bool,
    pub total_count: i32,
    pub done_count: i32,
    pub failed_count: i32,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

// ── Handlers ──────────────────────────────────────────────────────────────────

/// POST /api/templates/{id}/jobs
pub async fn create_job(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(template_id): Path<Uuid>,
    Json(body): Json<CreateJobRequest>,
) -> Result<impl IntoResponse, AppError> {
    if body.records.is_empty() {
        return Ok((
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(json!({ "error": "records array must not be empty" })),
        )
            .into_response());
    }

    // Verify ownership
    let tmpl = sqlx::query!(
        "SELECT id FROM templates WHERE id = $1 AND user_id = $2",
        template_id,
        user.user_id,
    )
    .fetch_optional(&state.db)
    .await?;
    if tmpl.is_none() {
        return Err(AppError::NotFound);
    }

    // Validate all records against schema
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

        let mut all_errors: Vec<serde_json::Value> = vec![];
        for (idx, record) in body.records.iter().enumerate() {
            for e in validator.iter_errors(record) {
                let field = e.instance_path.to_string();
                let field = if field.is_empty() {
                    "payload".to_string()
                } else {
                    field.trim_start_matches('/').replace('/', ".").to_string()
                };
                all_errors.push(json!({
                    "record_index": idx,
                    "field": field,
                    "message": e.to_string(),
                }));
            }
        }
        if !all_errors.is_empty() {
            return Ok((
                StatusCode::UNPROCESSABLE_ENTITY,
                Json(json!({ "errors": all_errors })),
            )
                .into_response());
        }
    }

    let record_count = body.records.len() as i32;

    // Auto-generate name "Job N"
    let existing: i64 = sqlx::query_scalar!(
        "SELECT COUNT(*) FROM jobs WHERE template_id = $1",
        template_id,
    )
    .fetch_one(&state.db)
    .await?
    .unwrap_or(0);
    let job_name = format!("Job {}", existing + 1);

    // Create job + items in a transaction, swapping the active flag
    let mut tx = state.db.begin().await?;

    sqlx::query!(
        "UPDATE jobs SET is_active = false WHERE template_id = $1 AND is_active = true",
        template_id,
    )
    .execute(&mut *tx)
    .await?;

    let job_id = sqlx::query_scalar!(
        r#"INSERT INTO jobs (template_id, user_id, name, status, is_active, total_count)
           VALUES ($1, $2, $3, 'draft', true, $4) RETURNING id"#,
        template_id,
        user.user_id,
        job_name,
        record_count,
    )
    .fetch_one(&mut *tx)
    .await?;

    for (idx, record) in body.records.iter().enumerate() {
        sqlx::query!(
            "INSERT INTO job_items (job_id, record_index, payload) VALUES ($1, $2, $3)",
            job_id,
            idx as i32,
            record,
        )
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    Ok((
        StatusCode::CREATED,
        Json(json!({ "job_id": job_id, "item_count": record_count })),
    )
        .into_response())
}

/// GET /api/templates/{id}/jobs
pub async fn list_template_jobs(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(template_id): Path<Uuid>,
) -> Result<Json<Vec<JobSummary>>, AppError> {
    // Verify ownership
    let tmpl = sqlx::query!(
        "SELECT id FROM templates WHERE id = $1 AND user_id = $2",
        template_id,
        user.user_id,
    )
    .fetch_optional(&state.db)
    .await?;
    if tmpl.is_none() {
        return Err(AppError::NotFound);
    }

    let rows = sqlx::query!(
        r#"SELECT id, name, status, is_active, total_count, done_count, failed_count, created_at
           FROM jobs WHERE template_id = $1 ORDER BY created_at DESC"#,
        template_id,
    )
    .fetch_all(&state.db)
    .await?;

    let jobs = rows
        .into_iter()
        .map(|r| JobSummary {
            id: r.id,
            name: r.name,
            status: r.status,
            is_active: r.is_active,
            total_count: r.total_count,
            done_count: r.done_count,
            failed_count: r.failed_count,
            created_at: r.created_at,
        })
        .collect();

    Ok(Json(jobs))
}

/// GET /api/jobs/{id}
pub async fn get_job(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(job_id): Path<Uuid>,
) -> Result<Json<JobResponse>, AppError> {
    let row = sqlx::query!(
        r#"SELECT id, name, status, is_active, total_count, done_count, failed_count,
                  created_at, completed_at
           FROM jobs WHERE id = $1 AND user_id = $2"#,
        job_id,
        user.user_id,
    )
    .fetch_optional(&state.db)
    .await?;
    let row = row.ok_or(AppError::NotFound)?;

    let item_rows = sqlx::query!(
        "SELECT id, record_index, record_id, status, error_message, payload
         FROM job_items WHERE job_id = $1 ORDER BY record_index",
        job_id,
    )
    .fetch_all(&state.db)
    .await?;

    let items = item_rows
        .into_iter()
        .map(|r| JobItemResponse {
            id: r.id,
            record_index: r.record_index,
            record_id: r.record_id,
            status: r.status,
            error_message: r.error_message,
            payload: r.payload,
        })
        .collect();

    Ok(Json(JobResponse {
        id: row.id,
        name: row.name,
        status: row.status,
        is_active: row.is_active,
        total_count: row.total_count,
        done_count: row.done_count,
        failed_count: row.failed_count,
        created_at: row.created_at,
        completed_at: row.completed_at,
        items,
    }))
}

/// POST /api/jobs/{id}/submit
pub async fn submit_job(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(job_id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    // Verify ownership
    let job = sqlx::query!(
        "SELECT id FROM jobs WHERE id = $1 AND user_id = $2",
        job_id,
        user.user_id,
    )
    .fetch_optional(&state.db)
    .await?;
    if job.is_none() {
        return Err(AppError::NotFound);
    }

    // Fetch all loaded items
    let item_ids: Vec<Uuid> = sqlx::query_scalar!(
        "UPDATE job_items SET status = 'queued'
         WHERE job_id = $1 AND status = 'loaded'
         RETURNING id",
        job_id,
    )
    .fetch_all(&state.db)
    .await?;

    let queued = item_ids.len() as i32;

    // Update job status to pending (will move to processing when first item starts)
    sqlx::query!(
        "UPDATE jobs SET status = 'pending' WHERE id = $1 AND status = 'draft'",
        job_id,
    )
    .execute(&state.db)
    .await?;

    // Spawn render tasks
    for item_id in item_ids {
        let state_clone = state.clone();
        tokio::spawn(async move {
            run_render_item(state_clone, item_id).await;
        });
    }

    Ok((StatusCode::ACCEPTED, Json(json!({ "queued": queued }))).into_response())
}

/// POST /api/jobs/{id}/items/{item_id}/submit
pub async fn submit_item(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path((job_id, item_id)): Path<(Uuid, Uuid)>,
) -> Result<impl IntoResponse, AppError> {
    // Verify ownership via job
    let job = sqlx::query!(
        "SELECT id FROM jobs WHERE id = $1 AND user_id = $2",
        job_id,
        user.user_id,
    )
    .fetch_optional(&state.db)
    .await?;
    if job.is_none() {
        return Err(AppError::NotFound);
    }

    let updated = sqlx::query_scalar!(
        "UPDATE job_items SET status = 'queued'
         WHERE id = $1 AND job_id = $2 AND status = 'loaded'
         RETURNING id",
        item_id,
        job_id,
    )
    .fetch_optional(&state.db)
    .await?;

    if updated.is_none() {
        return Err(AppError::NotFound);
    }

    // Nudge job out of draft
    sqlx::query!(
        "UPDATE jobs SET status = 'processing' WHERE id = $1 AND status = 'draft'",
        job_id,
    )
    .execute(&state.db)
    .await?;

    let state_clone = state.clone();
    tokio::spawn(async move {
        run_render_item(state_clone, item_id).await;
    });

    Ok(StatusCode::ACCEPTED.into_response())
}

/// GET /api/jobs/{id}/items/{item_id}/download
pub async fn download_item(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path((job_id, item_id)): Path<(Uuid, Uuid)>,
) -> Result<Response, AppError> {
    let job = sqlx::query!(
        "SELECT id FROM jobs WHERE id = $1 AND user_id = $2",
        job_id,
        user.user_id,
    )
    .fetch_optional(&state.db)
    .await?;
    if job.is_none() {
        return Err(AppError::NotFound);
    }

    let item = sqlx::query!(
        "SELECT status FROM job_items WHERE id = $1 AND job_id = $2",
        item_id,
        job_id,
    )
    .fetch_optional(&state.db)
    .await?;
    let item = item.ok_or(AppError::NotFound)?;

    if item.status != "done" {
        return Ok((
            StatusCode::CONFLICT,
            Json(json!({ "error": "Document is not yet ready", "status": item.status })),
        )
            .into_response());
    }

    let doc = sqlx::query!(
        "SELECT pdf_bytes FROM generated_documents WHERE job_item_id = $1",
        item_id,
    )
    .fetch_optional(&state.db)
    .await?;
    let doc = doc.ok_or(AppError::NotFound)?;

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/pdf")
        .header(
            header::CONTENT_DISPOSITION,
            format!("attachment; filename=\"record_{item_id}.pdf\""),
        )
        .body(Body::from(doc.pdf_bytes))
        .unwrap())
}

/// GET /api/jobs/{id}/download — ZIP of all completed items
pub async fn download_zip(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(job_id): Path<Uuid>,
) -> Result<Response, AppError> {
    let job = sqlx::query!(
        "SELECT id FROM jobs WHERE id = $1 AND user_id = $2",
        job_id,
        user.user_id,
    )
    .fetch_optional(&state.db)
    .await?;
    if job.is_none() {
        return Err(AppError::NotFound);
    }

    let items = sqlx::query!(
        r#"SELECT ji.record_index, ji.record_id, gd.pdf_bytes
           FROM job_items ji
           JOIN generated_documents gd ON gd.job_item_id = ji.id
           WHERE ji.job_id = $1 AND ji.status = 'done'
           ORDER BY ji.record_index"#,
        job_id,
    )
    .fetch_all(&state.db)
    .await?;

    if items.is_empty() {
        return Ok((
            StatusCode::CONFLICT,
            Json(json!({ "error": "No completed documents available yet" })),
        )
            .into_response());
    }

    let cursor = Cursor::new(Vec::new());
    let mut zip = ZipWriter::new(cursor);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

    for item in &items {
        let filename = item
            .record_id
            .as_deref()
            .map(|id| format!("{id}.pdf"))
            .unwrap_or_else(|| format!("record_{}.pdf", item.record_index));
        zip.start_file(&filename, options)
            .map_err(|e| AppError::Internal(e.to_string()))?;
        zip.write_all(&item.pdf_bytes)
            .map_err(|e| AppError::Internal(e.to_string()))?;
    }

    let cursor = zip
        .finish()
        .map_err(|e| AppError::Internal(e.to_string()))?;
    let zip_bytes = cursor.into_inner();

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/zip")
        .header(
            header::CONTENT_DISPOSITION,
            format!("attachment; filename=\"job-{job_id}.zip\""),
        )
        .body(Body::from(zip_bytes))
        .unwrap())
}

/// PATCH /api/jobs/{id}/active
pub async fn set_active(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(job_id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let job = sqlx::query!(
        "SELECT id, template_id FROM jobs WHERE id = $1 AND user_id = $2",
        job_id,
        user.user_id,
    )
    .fetch_optional(&state.db)
    .await?;
    let job = job.ok_or(AppError::NotFound)?;

    let mut tx = state.db.begin().await?;

    // Deactivate current active job first, then activate the target
    sqlx::query!(
        "UPDATE jobs SET is_active = false WHERE template_id = $1 AND is_active = true",
        job.template_id,
    )
    .execute(&mut *tx)
    .await?;

    sqlx::query!(
        "UPDATE jobs SET is_active = true WHERE id = $1",
        job_id,
    )
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(Json(json!({ "job_id": job_id })))
}
