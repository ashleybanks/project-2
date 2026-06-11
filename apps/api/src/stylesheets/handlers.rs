use axum::{
    extract::{Extension, State},
    Json,
};
use serde_json::{json, Value};

use crate::{AppState, AppError, auth::middleware::AuthUser};

pub(crate) fn default_brand_rules() -> Value {
    json!({
        "headingFont": "Inter",
        "bodyFont": "Inter",
        "headingColour": "#1A1A1A",
        "bodyColour": "#374151",
        "h1": { "fontSize": 20, "spacingBefore": 12, "spacingAfter": 6 },
        "h2": { "fontSize": 16, "spacingBefore": 10, "spacingAfter": 4 },
        "h3": { "fontSize": 13, "spacingBefore": 8,  "spacingAfter": 3 },
        "h4": { "fontSize": 12, "spacingBefore": 8,  "spacingAfter": 2 },
        "h5": { "fontSize": 11, "spacingBefore": 6,  "spacingAfter": 2 },
        "h6": { "fontSize": 11, "spacingBefore": 6,  "spacingAfter": 2 },
        "normal": { "fontSize": 11, "spacingAfter": 6, "indentSize": 12 },
        "tableHeader": { "fontSize": 10, "spacingBefore": 3, "spacingAfter": 3, "lineWidth": 0.5, "lineColour": "#E5E7EB" },
        "tableData":   { "fontSize": 10, "spacingBefore": 3, "spacingAfter": 3, "lineWidth": 0.5, "lineColour": "#E5E7EB" }
    })
}

pub async fn get_brand_rules(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
) -> Result<Json<Value>, AppError> {
    let row = sqlx::query!(
        "SELECT settings FROM users WHERE id = $1",
        user.user_id,
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    let brand_rules = row.settings
        .get("brand_rules")
        .cloned()
        .and_then(|v| match &v {
            Value::Object(o) if !o.is_empty() => Some(v),
            _ => None,
        })
        .unwrap_or_else(default_brand_rules);

    Ok(Json(brand_rules))
}

pub async fn put_brand_rules(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    sqlx::query!(
        "UPDATE users
         SET settings = COALESCE(settings, '{}') || jsonb_build_object('brand_rules', $2::jsonb)
         WHERE id = $1",
        user.user_id,
        body,
    )
    .execute(&state.db)
    .await?;

    Ok(Json(body))
}
