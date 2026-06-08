use axum::{
    extract::State,
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Json},
};
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{AppState, error::AppError};
use super::session::{self, COOKIE_NAME};

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

    let token = session::create(&state.db, user.id).await?;
    let cookie = session_cookie(&token, false);

    Ok((
        StatusCode::CREATED,
        [(header::SET_COOKIE, cookie)],
        Json(UserResponse {
            id: user.id.to_string(),
            email: user.email,
            name: user.name,
        }),
    ))
}

pub async fn sign_in(
    State(state): State<AppState>,
    Json(body): Json<SignInRequest>,
) -> Result<impl IntoResponse, AppError> {
    use argon2::{Argon2, PasswordVerifier};
    use argon2::password_hash::PasswordHash;

    let user = sqlx::query!(
        "SELECT id, email, name, password_hash FROM users WHERE email = $1",
        body.email,
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::InvalidCredentials)?;

    let parsed = PasswordHash::new(&user.password_hash)
        .map_err(|_| AppError::InvalidCredentials)?;

    Argon2::default()
        .verify_password(body.password.as_bytes(), &parsed)
        .map_err(|_| AppError::InvalidCredentials)?;

    let token = session::create(&state.db, user.id).await?;
    let cookie = session_cookie(&token, false);

    Ok((
        [(header::SET_COOKIE, cookie)],
        Json(UserResponse {
            id: user.id.to_string(),
            email: user.email,
            name: user.name,
        }),
    ))
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

fn session_cookie(token: &str, secure: bool) -> String {
    let secure_flag = if secure { "; Secure" } else { "" };
    format!(
        "{COOKIE_NAME}={token}; HttpOnly; SameSite=Lax; Path=/; Max-Age={}{}",
        30 * 24 * 3600,
        secure_flag,
    )
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
        Ok(sess) => Json(json!({
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
                "createdAt":     sess.created_at,
                "updatedAt":     sess.created_at,
            }
        })),
        Err(_) => Json(json!(null)),
    }
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
