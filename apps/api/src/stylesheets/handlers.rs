use axum::{
    extract::{Extension, State},
    Json,
};
use serde_json::{json, Value};

use crate::{AppState, AppError, auth::middleware::AuthUser};

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
        .unwrap_or_else(|| json!({}));

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
