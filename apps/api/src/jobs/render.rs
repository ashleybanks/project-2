use tracing::{info, warn};
use uuid::Uuid;

use crate::AppState;

pub async fn run_render_job(state: AppState, job_id: Uuid) {
    if let Err(e) = try_run_render_job(&state, job_id).await {
        warn!(%job_id, error = %e, "Render job failed");
        let _ = sqlx::query!(
            "UPDATE jobs SET status = 'failed', error_message = $1, completed_at = now()
             WHERE id = $2",
            e.to_string(),
            job_id,
        )
        .execute(&state.db)
        .await;
    }
}

async fn try_run_render_job(state: &AppState, job_id: Uuid) -> anyhow::Result<()> {
    // Mark as processing
    sqlx::query!(
        "UPDATE jobs SET status = 'processing', started_at = now() WHERE id = $1",
        job_id,
    )
    .execute(&state.db)
    .await?;

    info!(%job_id, "Render job started");

    // Load job + template in one query
    let row = sqlx::query!(
        r#"
        SELECT j.payload, t.block_model, t.stylesheet
        FROM jobs j
        JOIN templates t ON t.id = j.template_id
        WHERE j.id = $1
        "#,
        job_id,
    )
    .fetch_one(&state.db)
    .await?;

    let payload: serde_json::Value = row.payload;
    let block_model_json: serde_json::Value = row.block_model;
    let stylesheet_json: serde_json::Value = row.stylesheet;

    // Deserialise block model
    let blocks: Vec<typst_compiler::frontend_model::FrontendTopLevel> =
        serde_json::from_value(
            block_model_json
                .get("blocks")
                .cloned()
                .unwrap_or(serde_json::Value::Array(vec![])),
        )
        .map_err(|e| anyhow::anyhow!("Failed to parse block model: {e}"))?;

    let stylesheet: Option<typst_compiler::model::StylesheetDef> =
        serde_json::from_value(stylesheet_json).ok();

    // Compile + render
    let block_model = typst_compiler::frontend_model::map_to_block_model(blocks);
    let source = typst_compiler::compile(&block_model, stylesheet.as_ref());

    info!(%job_id, "Compiling Typst source");
    let pdf_bytes = typst_compiler::render(&source, &payload)
        .map_err(|e| anyhow::anyhow!("Render failed: {e}"))?;

    info!(%job_id, bytes = pdf_bytes.len(), "Render complete, storing PDF");

    // Store PDF
    sqlx::query!(
        "INSERT INTO generated_documents (job_id, pdf_bytes) VALUES ($1, $2)",
        job_id,
        pdf_bytes.as_slice(),
    )
    .execute(&state.db)
    .await?;

    // Mark done
    sqlx::query!(
        "UPDATE jobs SET status = 'done', completed_at = now() WHERE id = $1",
        job_id,
    )
    .execute(&state.db)
    .await?;

    info!(%job_id, "Render job complete");
    Ok(())
}
