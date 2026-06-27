use tracing::{info, warn};
use uuid::Uuid;

use crate::AppState;


pub async fn run_render_item(state: AppState, job_item_id: Uuid) {
    if let Err(e) = try_run_render_item(&state, job_item_id).await {
        warn!(%job_item_id, error = %e, "Render item failed");
        let _ = sqlx::query!(
            "UPDATE job_items SET status = 'failed', error_message = $1, completed_at = now()
             WHERE id = $2",
            e.to_string(),
            job_item_id,
        )
        .execute(&state.db)
        .await;
        let _ = update_job_aggregate(&state.db, job_item_id).await;
    }
}

async fn try_run_render_item(state: &AppState, job_item_id: Uuid) -> anyhow::Result<()> {
    // Mark item as processing and nudge parent job out of draft/pending
    sqlx::query!(
        "UPDATE job_items SET status = 'processing' WHERE id = $1",
        job_item_id,
    )
    .execute(&state.db)
    .await?;

    sqlx::query!(
        r#"UPDATE jobs SET status = 'processing'
           WHERE id = (SELECT job_id FROM job_items WHERE id = $1)
             AND status IN ('draft', 'pending')"#,
        job_item_id,
    )
    .execute(&state.db)
    .await?;

    info!(%job_item_id, "Render item started");

    let row = sqlx::query!(
        r#"
        SELECT ji.payload, t.block_model, t.stylesheet
        FROM job_items ji
        JOIN jobs j ON j.id = ji.job_id
        JOIN templates t ON t.id = j.template_id
        WHERE ji.id = $1
        "#,
        job_item_id,
    )
    .fetch_one(&state.db)
    .await?;

    let payload: serde_json::Value = row.payload;
    let block_model_json: serde_json::Value = row.block_model;
    let stylesheet_json: serde_json::Value = row.stylesheet;

    let mut blocks: Vec<typst_compiler::frontend_model::FrontendTopLevel> =
        serde_json::from_value(
            block_model_json
                .get("blocks")
                .cloned()
                .unwrap_or(serde_json::Value::Array(vec![])),
        )
        .map_err(|e| anyhow::anyhow!("Failed to parse block model: {e}"))?;

    let stylesheet: Option<typst_compiler::model::StylesheetDef> =
        serde_json::from_value(stylesheet_json).ok();

    let augmented_payload =
        typst_compiler::frontend_model::evaluate_and_apply_expressions(&mut blocks, &payload);

    let block_model = typst_compiler::frontend_model::map_to_block_model(blocks);
    let source = typst_compiler::compile(&block_model, stylesheet.as_ref(), false);

    info!(%job_item_id, "Compiling Typst source");
    let pdf_bytes = typst_compiler::render(&source, &augmented_payload)
        .map_err(|e| anyhow::anyhow!("Render failed: {e}"))?;

    info!(%job_item_id, bytes = pdf_bytes.len(), "Render complete, storing PDF");

    sqlx::query!(
        "INSERT INTO generated_documents (job_item_id, pdf_bytes) VALUES ($1, $2)",
        job_item_id,
        pdf_bytes.as_slice(),
    )
    .execute(&state.db)
    .await?;

    sqlx::query!(
        "UPDATE job_items SET status = 'done', completed_at = now() WHERE id = $1",
        job_item_id,
    )
    .execute(&state.db)
    .await?;

    info!(%job_item_id, "Render item complete");

    update_job_aggregate(&state.db, job_item_id).await?;
    Ok(())
}

pub async fn update_job_aggregate(db: &sqlx::PgPool, job_item_id: Uuid) -> anyhow::Result<()> {
    sqlx::query!(
        r#"
        WITH counts AS (
            SELECT
                job_id,
                COUNT(*)                                        AS total,
                COUNT(*) FILTER (WHERE status = 'done')        AS done,
                COUNT(*) FILTER (WHERE status = 'failed')      AS failed,
                COUNT(*) FILTER (WHERE status IN ('loaded', 'queued', 'processing')) AS pending
            FROM job_items
            WHERE job_id = (SELECT job_id FROM job_items WHERE id = $1)
            GROUP BY job_id
        )
        UPDATE jobs j
        SET
            done_count   = c.done,
            failed_count = c.failed,
            status = CASE
                WHEN c.pending > 0                      THEN 'processing'
                WHEN c.done = c.total                   THEN 'done'
                WHEN c.failed = c.total                 THEN 'failed'
                ELSE 'partial'
            END,
            completed_at = CASE
                WHEN c.pending = 0 THEN now()
                ELSE j.completed_at
            END
        FROM counts c
        WHERE j.id = c.job_id
          AND j.status != 'cancelled'
        "#,
        job_item_id,
    )
    .execute(db)
    .await?;
    Ok(())
}
