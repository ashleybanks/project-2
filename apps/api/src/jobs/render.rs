use tracing::{info, warn};
use uuid::Uuid;

use crate::AppState;

fn evaluate_expressions(
    entries: &[typst_compiler::frontend_model::ExpressionEntry],
    payload: &serde_json::Value,
) -> anyhow::Result<serde_json::Value> {
    if entries.is_empty() {
        return Ok(payload.clone());
    }

    let parser = liquid::ParserBuilder::with_stdlib()
        .build()
        .map_err(|e| anyhow::anyhow!("Liquid parser init failed: {e}"))?;

    let globals = json_to_liquid_object(payload);

    let mut augmented = payload.clone();
    for entry in entries {
        let tmpl_str = format!("{{{{ {} }}}}", entry.expression);
        let tmpl = parser
            .parse(&tmpl_str)
            .map_err(|e| anyhow::anyhow!("Invalid expression '{}': {e}", entry.expression))?;
        let result = tmpl
            .render(&globals)
            .map_err(|e| anyhow::anyhow!("Expression '{}' failed: {e}", entry.expression))?;
        if let serde_json::Value::Object(ref mut map) = augmented {
            map.insert(entry.placeholder.clone(), serde_json::Value::String(result));
        }
    }

    Ok(augmented)
}

fn json_to_liquid_object(v: &serde_json::Value) -> liquid::Object {
    if let serde_json::Value::Object(map) = v {
        map.iter()
            .map(|(k, v)| (k.clone().into(), json_to_liquid_value(v)))
            .collect()
    } else {
        liquid::Object::new()
    }
}

fn json_to_liquid_value(v: &serde_json::Value) -> liquid::model::Value {
    match v {
        serde_json::Value::Null => liquid::model::Value::Nil,
        serde_json::Value::Bool(b) => liquid::model::Value::scalar(*b),
        serde_json::Value::Number(n) => n
            .as_f64()
            .map(liquid::model::Value::scalar)
            .unwrap_or(liquid::model::Value::Nil),
        serde_json::Value::String(s) => liquid::model::Value::scalar(s.clone()),
        serde_json::Value::Array(arr) => {
            liquid::model::Value::Array(arr.iter().map(json_to_liquid_value).collect())
        }
        serde_json::Value::Object(obj) => liquid::model::Value::Object(
            obj.iter()
                .map(|(k, v)| (k.clone().into(), json_to_liquid_value(v)))
                .collect(),
        ),
    }
}

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

    let entries = typst_compiler::frontend_model::collect_expression_entries(&blocks);
    let augmented_payload = evaluate_expressions(&entries, &payload)?;
    typst_compiler::frontend_model::apply_expression_entries(&mut blocks, &entries);

    let block_model = typst_compiler::frontend_model::map_to_block_model(blocks);
    let source = typst_compiler::compile(&block_model, stylesheet.as_ref());

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
        "#,
        job_item_id,
    )
    .execute(db)
    .await?;
    Ok(())
}
