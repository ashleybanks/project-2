use axum::{
    extract::{Query, State},
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Json, Response},
};
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{AppState, error::AppError};
use super::session::{self, COOKIE_NAME};
use super::verification;
use super::reset;

#[derive(Deserialize)]
pub struct SignUpRequest {
    pub email: String,
    pub password: String,
    pub name: Option<String>,
}

#[derive(Deserialize)]
pub struct SignInRequest {
    pub email: String,
    pub password: String,
}

#[derive(Deserialize)]
pub struct ResendVerificationRequest {
    pub email: String,
}

#[derive(Deserialize)]
pub struct VerifyEmailParams {
    pub token: String,
}

#[derive(Serialize)]
pub struct UserResponse {
    pub id: String,
    pub email: String,
    pub name: Option<String>,
}

pub async fn sign_up(
    State(state): State<AppState>,
    Json(body): Json<SignUpRequest>,
) -> Result<impl IntoResponse, AppError> {
    use argon2::{Argon2, PasswordHasher};
    use argon2::password_hash::{rand_core::OsRng, SaltString};

    let salt = SaltString::generate(&mut OsRng);
    let hash = Argon2::default()
        .hash_password(body.password.as_bytes(), &salt)
        .map_err(|_| AppError::Internal("Password hashing failed".into()))?
        .to_string();

    let user = sqlx::query!(
        "INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3)
         ON CONFLICT (email) DO NOTHING
         RETURNING id, email, name",
        body.email,
        hash,
        body.name,
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::EmailInUse)?;

    let token = verification::create_token(&state.db, user.id).await?;

    let email_sent = match crate::email::send_verification_email(
        &state.resend_api_key,
        &state.from_email,
        &user.email,
        &token,
        &state.api_base_url,
    )
    .await
    {
        Ok(()) => true,
        Err(e) => {
            tracing::error!("Failed to send verification email to {}: {e}", user.email);
            false
        }
    };

    Ok((
        StatusCode::CREATED,
        Json(json!({
            "message": "check_your_email",
            "email_sent": email_sent,
        })),
    ))
}

pub async fn sign_in(
    State(state): State<AppState>,
    Json(body): Json<SignInRequest>,
) -> Result<Response, AppError> {
    use argon2::{Argon2, PasswordVerifier};
    use argon2::password_hash::PasswordHash;

    let user = sqlx::query!(
        "SELECT id, email, name, password_hash, email_verified FROM users WHERE email = $1",
        body.email,
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::InvalidCredentials)?;

    let hash = user.password_hash.as_deref().ok_or(AppError::InvalidCredentials)?;
    let parsed = PasswordHash::new(hash)
        .map_err(|_| AppError::InvalidCredentials)?;

    Argon2::default()
        .verify_password(body.password.as_bytes(), &parsed)
        .map_err(|_| AppError::InvalidCredentials)?;

    if !user.email_verified {
        return Err(AppError::EmailNotVerified);
    }

    // Check MFA — if enabled, issue a pending token instead of a session
    let mfa_enabled = sqlx::query_scalar!(
        "SELECT enabled FROM user_mfa WHERE user_id = $1",
        user.id,
    )
    .fetch_optional(&state.db)
    .await?
    .unwrap_or(false);

    if mfa_enabled {
        let mfa_token = super::mfa::create_pending_token(&state.db, user.id).await?;
        return Ok(Json(serde_json::json!({
            "mfa_required": true,
            "mfa_token": mfa_token,
        }))
        .into_response());
    }

    let token = session::create(&state.db, user.id).await?;
    let cookie = session_cookie(&token, false);

    Ok((
        [(header::SET_COOKIE, cookie)],
        Json(UserResponse {
            id: user.id.to_string(),
            email: user.email,
            name: user.name,
        }),
    )
    .into_response())
}

pub async fn sign_out(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    if let Some(token) = extract_token(&headers) {
        session::delete(&state.db, &token).await?;
    }

    let clear = format!(
        "{COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"
    );

    Ok(([(header::SET_COOKIE, clear)], StatusCode::OK))
}

/// GET /api/auth/session — returns the current session in Better Auth format.
/// Returns null when no valid session exists (SDK treats null as unauthenticated).
pub async fn get_session(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Json<serde_json::Value> {
    let Some(token) = extract_token(&headers) else {
        return Json(json!(null));
    };
    match session::validate(&state.db, &token).await {
        Ok(sess) => {
            let mfa_enabled = sqlx::query_scalar!(
                "SELECT enabled FROM user_mfa WHERE user_id = $1",
                sess.user_id,
            )
            .fetch_optional(&state.db)
            .await
            .ok()
            .flatten()
            .unwrap_or(false);

            Json(json!({
                "session": {
                    "id":        sess.session_id,
                    "userId":    sess.user_id,
                    "expiresAt": sess.expires_at,
                    "token":     token,
                },
                "user": {
                    "id":            sess.user_id,
                    "email":         sess.email,
                    "name":          sess.name,
                    "emailVerified": false,
                    "mfaEnabled":    mfa_enabled,
                    "createdAt":     sess.created_at,
                    "updatedAt":     sess.created_at,
                }
            }))
        }
        Err(_) => Json(json!(null)),
    }
}

/// GET /api/auth/verify-email?token= — verifies the token, creates a session, and redirects.
pub async fn verify_email(
    State(state): State<AppState>,
    Query(params): Query<VerifyEmailParams>,
) -> Response {
    match try_verify_email(&state, &params.token).await {
        Ok(cookie) => (
            StatusCode::FOUND,
            [
                (header::SET_COOKIE, cookie),
                (
                    header::LOCATION,
                    format!("{}/?verified=true", state.frontend_url),
                ),
            ],
        )
            .into_response(),
        Err(_) => (
            StatusCode::FOUND,
            [(
                header::LOCATION,
                format!("{}/verify-email/error", state.frontend_url),
            )],
        )
            .into_response(),
    }
}

async fn try_verify_email(state: &AppState, token: &str) -> Result<String, AppError> {
    let user_id = verification::validate_token(&state.db, token).await?;

    sqlx::query!(
        "UPDATE users SET email_verified = true, updated_at = NOW() WHERE id = $1",
        user_id,
    )
    .execute(&state.db)
    .await?;

    let session_token = session::create(&state.db, user_id).await?;
    Ok(session_cookie(&session_token, false))
}

/// POST /api/auth/resend-verification — resends the verification email.
/// Always returns 200 regardless of whether the email is registered, to prevent enumeration.
pub async fn resend_verification(
    State(state): State<AppState>,
    Json(body): Json<ResendVerificationRequest>,
) -> StatusCode {
    let Ok(user) = sqlx::query!(
        "SELECT id, email_verified FROM users WHERE email = $1",
        body.email,
    )
    .fetch_optional(&state.db)
    .await
    else {
        return StatusCode::OK;
    };

    if let Some(user) = user {
        if !user.email_verified {
            if let Ok(token) = verification::create_token(&state.db, user.id).await {
                let _ = crate::email::send_verification_email(
                    &state.resend_api_key,
                    &state.from_email,
                    &body.email,
                    &token,
                    &state.api_base_url,
                )
                .await;
            }
        }
    }

    StatusCode::OK
}

fn session_cookie(token: &str, secure: bool) -> String {
    let secure_flag = if secure { "; Secure" } else { "" };
    format!(
        "{COOKIE_NAME}={token}; HttpOnly; SameSite=Lax; Path=/; Max-Age={}{}",
        30 * 24 * 3600,
        secure_flag,
    )
}

pub fn extract_token(headers: &HeaderMap) -> Option<String> {
    let cookies = headers.get(header::COOKIE)?.to_str().ok()?;
    cookies
        .split(';')
        .find_map(|part| {
            let part = part.trim();
            part.strip_prefix(COOKIE_NAME)
                .and_then(|s| s.strip_prefix('='))
                .map(|v| v.to_string())
        })
}

// ── Password reset handlers ───────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct ForgotPasswordRequest {
    pub email: String,
}

#[derive(Deserialize)]
pub struct ResetPasswordRequest {
    pub token: String,
    pub password: String,
}

/// POST /api/auth/forgot-password — initiates a password reset.
/// Always returns 200 regardless of whether the email is registered.
pub async fn forgot_password(
    State(state): State<AppState>,
    Json(body): Json<ForgotPasswordRequest>,
) -> StatusCode {
    let Ok(Some(user)) = sqlx::query!(
        "SELECT id FROM users WHERE email = $1",
        body.email,
    )
    .fetch_optional(&state.db)
    .await
    else {
        return StatusCode::OK;
    };

    match reset::create_token(&state.db, user.id).await {
        Ok(token) => {
            if let Err(e) = crate::email::send_reset_email(
                &state.resend_api_key,
                &state.from_email,
                &body.email,
                &token,
                &state.api_base_url,
            )
            .await
            {
                tracing::error!("Failed to send reset email to {}: {e}", body.email);
            }
        }
        Err(e) => tracing::error!("Failed to create reset token for {}: {e}", body.email),
    }

    StatusCode::OK
}

/// GET /api/auth/reset-password?token= — validates the token and redirects to the frontend form.
pub async fn validate_reset_token(
    State(state): State<AppState>,
    Query(params): Query<VerifyEmailParams>,
) -> Response {
    match reset::validate_token(&state.db, &params.token).await {
        Ok(_) => (
            StatusCode::FOUND,
            [(
                header::LOCATION,
                format!(
                    "{}/reset-password?token={}",
                    state.frontend_url, params.token
                ),
            )],
        )
            .into_response(),
        Err(_) => (
            StatusCode::FOUND,
            [(
                header::LOCATION,
                format!("{}/reset-password/error", state.frontend_url),
            )],
        )
            .into_response(),
    }
}

/// POST /api/auth/reset-password — consumes the token, updates the password, invalidates sessions.
pub async fn do_reset_password(
    State(state): State<AppState>,
    Json(body): Json<ResetPasswordRequest>,
) -> Response {
    match try_reset_password(&state, &body.token, &body.password).await {
        Ok(()) => (
            StatusCode::FOUND,
            [(
                header::LOCATION,
                format!("{}/sign-in?reset=true", state.frontend_url),
            )],
        )
            .into_response(),
        Err(_) => (
            StatusCode::FOUND,
            [(
                header::LOCATION,
                format!("{}/reset-password/error", state.frontend_url),
            )],
        )
            .into_response(),
    }
}

async fn try_reset_password(
    state: &AppState,
    token: &str,
    password: &str,
) -> Result<(), AppError> {
    use argon2::{Argon2, PasswordHasher};
    use argon2::password_hash::{rand_core::OsRng, SaltString};

    let user_id = reset::consume_token(&state.db, token).await?;

    let salt = SaltString::generate(&mut OsRng);
    let hash = Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map_err(|_| AppError::Internal("Password hashing failed".into()))?
        .to_string();

    sqlx::query!(
        "UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2",
        hash,
        user_id,
    )
    .execute(&state.db)
    .await?;

    sqlx::query!("DELETE FROM sessions WHERE user_id = $1", user_id)
        .execute(&state.db)
        .await?;

    Ok(())
}
