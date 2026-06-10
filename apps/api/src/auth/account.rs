use axum::{
    extract::{Extension, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
};
use serde::Deserialize;

use crate::{AppError, AppState};
use super::middleware::AuthUser;

fn unprocessable(code: &str, message: &str) -> Response {
    (
        StatusCode::UNPROCESSABLE_ENTITY,
        Json(serde_json::json!({ "error": code, "message": message })),
    )
        .into_response()
}

/// GET /api/auth/account/profile
pub async fn get_profile(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
) -> Result<Json<serde_json::Value>, AppError> {
    let row = sqlx::query!(
        "SELECT name, email, password_hash FROM users WHERE id = $1",
        user.user_id,
    )
    .fetch_one(&state.db)
    .await?;

    let has_password = row.password_hash.as_deref().map(|h| !h.is_empty()).unwrap_or(false);

    let google_linked = sqlx::query!(
        "SELECT id FROM oauth_accounts WHERE user_id = $1 AND provider = 'google' LIMIT 1",
        user.user_id,
    )
    .fetch_optional(&state.db)
    .await?
    .is_some();

    let mfa_enabled = sqlx::query_scalar!(
        "SELECT enabled FROM user_mfa WHERE user_id = $1",
        user.user_id,
    )
    .fetch_optional(&state.db)
    .await?
    .unwrap_or(false);

    Ok(Json(serde_json::json!({
        "name": row.name,
        "email": row.email,
        "has_password": has_password,
        "google_linked": google_linked,
        "mfa_enabled": mfa_enabled,
    })))
}

/// PATCH /api/auth/account/profile
#[derive(Deserialize)]
pub struct UpdateProfileRequest {
    pub name: String,
}

pub async fn update_profile(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Json(body): Json<UpdateProfileRequest>,
) -> Response {
    let name = body.name.trim().to_owned();
    if name.is_empty() {
        return unprocessable("INVALID_NAME", "Name cannot be empty");
    }
    if name.len() > 100 {
        return unprocessable("INVALID_NAME", "Name cannot exceed 100 characters");
    }

    if let Err(e) = sqlx::query!(
        "UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2",
        name,
        user.user_id,
    )
    .execute(&state.db)
    .await
    {
        tracing::error!("Failed to update profile for {}: {e}", user.user_id);
        return AppError::Internal("Failed to update profile".into()).into_response();
    }

    Json(serde_json::json!({ "name": name })).into_response()
}

/// POST /api/auth/account/change-password
#[derive(Deserialize)]
pub struct ChangePasswordRequest {
    pub current_password: String,
    pub new_password: String,
}

pub async fn change_password(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Json(body): Json<ChangePasswordRequest>,
) -> Response {
    use argon2::{Argon2, PasswordHasher, PasswordVerifier};
    use argon2::password_hash::{rand_core::OsRng, PasswordHash, SaltString};

    let Ok(row) = sqlx::query!(
        "SELECT password_hash FROM users WHERE id = $1",
        user.user_id,
    )
    .fetch_one(&state.db)
    .await
    else {
        return AppError::Internal("User not found".into()).into_response();
    };

    let Some(hash) = row.password_hash.as_deref().filter(|h| !h.is_empty()) else {
        return unprocessable("NO_PASSWORD", "This account uses Google sign-in and has no password");
    };

    let Ok(parsed) = PasswordHash::new(hash) else {
        return AppError::Internal("Password hash invalid".into()).into_response();
    };

    if Argon2::default()
        .verify_password(body.current_password.as_bytes(), &parsed)
        .is_err()
    {
        return unprocessable("INVALID_CURRENT_PASSWORD", "Current password is incorrect");
    }

    let salt = SaltString::generate(&mut OsRng);
    let Ok(new_hash) = Argon2::default().hash_password(body.new_password.as_bytes(), &salt) else {
        return AppError::Internal("Password hashing failed".into()).into_response();
    };

    if let Err(e) = sqlx::query!(
        "UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2",
        new_hash.to_string(),
        user.user_id,
    )
    .execute(&state.db)
    .await
    {
        tracing::error!("Failed to update password for {}: {e}", user.user_id);
        return AppError::Internal("Failed to update password".into()).into_response();
    }

    StatusCode::OK.into_response()
}
