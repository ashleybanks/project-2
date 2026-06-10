use axum::{
    body::Body,
    extract::{Query, State},
    http::{header, HeaderMap, StatusCode},
    response::Response,
};
use rand::Rng;
use serde::Deserialize;
use uuid::Uuid;

use crate::{AppError, AppState};
use super::session;

// ── State generation ──────────────────────────────────────────────────────────

fn generate_state() -> String {
    let bytes: Vec<u8> = (0..16).map(|_| rand::thread_rng().gen::<u8>()).collect();
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

// ── Cookie helpers ────────────────────────────────────────────────────────────

fn extract_cookie(headers: &HeaderMap, name: &str) -> Option<String> {
    let cookies = headers.get(header::COOKIE)?.to_str().ok()?;
    cookies.split(';').find_map(|part| {
        let part = part.trim();
        part.strip_prefix(name)
            .and_then(|s| s.strip_prefix('='))
            .map(|v| v.to_string())
    })
}

fn clear_cookie(name: &str) -> String {
    format!("{name}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0")
}

// ── Response helpers ──────────────────────────────────────────────────────────

fn oauth_error(frontend_url: &str) -> Response {
    axum::http::Response::builder()
        .status(StatusCode::FOUND)
        .header(
            header::LOCATION,
            format!("{frontend_url}/sign-in?error=oauth_failed"),
        )
        .body(Body::empty())
        .unwrap()
}

// ── Handlers ──────────────────────────────────────────────────────────────────

pub async fn initiate_google(State(state): State<AppState>) -> Response {
    let oauth_state = generate_state();
    let redirect_uri = format!("{}/api/auth/google/callback", state.api_base_url);

    let auth_url = reqwest::Client::new()
        .get("https://accounts.google.com/o/oauth2/v2/auth")
        .query(&[
            ("client_id", state.google_client_id.as_str()),
            ("redirect_uri", redirect_uri.as_str()),
            ("response_type", "code"),
            ("scope", "openid email profile"),
            ("state", oauth_state.as_str()),
        ])
        .build()
        .expect("valid Google auth URL")
        .url()
        .to_string();

    let state_cookie = format!(
        "oauth_state={oauth_state}; HttpOnly; SameSite=Lax; Path=/; Max-Age=300"
    );

    axum::http::Response::builder()
        .status(StatusCode::FOUND)
        .header(header::LOCATION, auth_url)
        .header(header::SET_COOKIE, state_cookie)
        .body(Body::empty())
        .unwrap()
}

#[derive(Deserialize)]
pub struct CallbackParams {
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
}

pub async fn google_callback(
    State(state): State<AppState>,
    Query(params): Query<CallbackParams>,
    headers: HeaderMap,
) -> Response {
    if params.error.is_some() {
        return oauth_error(&state.frontend_url);
    }

    let (Some(code), Some(state_param)) = (params.code.as_deref(), params.state.as_deref()) else {
        return oauth_error(&state.frontend_url);
    };

    // Validate CSRF state
    if extract_cookie(&headers, "oauth_state").as_deref() != Some(state_param) {
        return oauth_error(&state.frontend_url);
    }

    let redirect_uri = format!("{}/api/auth/google/callback", state.api_base_url);

    let access_token = match exchange_code(
        &state.google_client_id,
        &state.google_client_secret,
        code,
        &redirect_uri,
    )
    .await
    {
        Ok(t) => t,
        Err(_) => return oauth_error(&state.frontend_url),
    };

    let info = match fetch_userinfo(&access_token).await {
        Ok(i) => i,
        Err(_) => return oauth_error(&state.frontend_url),
    };

    if !info.verified_email {
        return oauth_error(&state.frontend_url);
    }

    let user_id = match resolve_user(&state.db, &info).await {
        Ok(id) => id,
        Err(_) => return oauth_error(&state.frontend_url),
    };

    let session_token = match session::create(&state.db, user_id).await {
        Ok(t) => t,
        Err(_) => return oauth_error(&state.frontend_url),
    };

    let session_cookie = format!(
        "{}={session_token}; HttpOnly; SameSite=Lax; Path=/; Max-Age={}",
        session::COOKIE_NAME,
        30 * 24 * 3600,
    );

    axum::http::Response::builder()
        .status(StatusCode::FOUND)
        .header(header::LOCATION, format!("{}/app/templates", state.frontend_url))
        .header(header::SET_COOKIE, session_cookie)
        .header(header::SET_COOKIE, clear_cookie("oauth_state"))
        .body(Body::empty())
        .unwrap()
}

// ── Google API helpers ────────────────────────────────────────────────────────

async fn exchange_code(
    client_id: &str,
    client_secret: &str,
    code: &str,
    redirect_uri: &str,
) -> Result<String, AppError> {
    let client = reqwest::Client::new();
    let res = client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("client_id", client_id),
            ("client_secret", client_secret),
            ("code", code),
            ("redirect_uri", redirect_uri),
            ("grant_type", "authorization_code"),
        ])
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("Token exchange failed: {e}")))?;

    if !res.status().is_success() {
        let body = res.text().await.unwrap_or_default();
        return Err(AppError::Internal(format!("Token exchange error: {body}")));
    }

    let body: serde_json::Value = res
        .json()
        .await
        .map_err(|e| AppError::Internal(format!("Token parse failed: {e}")))?;

    body["access_token"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| AppError::Internal("No access_token in response".into()))
}

#[derive(Deserialize)]
struct GoogleUserInfo {
    id: String,
    email: String,
    verified_email: bool,
    name: Option<String>,
}

async fn fetch_userinfo(access_token: &str) -> Result<GoogleUserInfo, AppError> {
    let client = reqwest::Client::new();
    let res = client
        .get("https://www.googleapis.com/oauth2/v2/userinfo")
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("Userinfo fetch failed: {e}")))?;

    if !res.status().is_success() {
        let body = res.text().await.unwrap_or_default();
        return Err(AppError::Internal(format!("Userinfo error: {body}")));
    }

    res.json::<GoogleUserInfo>()
        .await
        .map_err(|e| AppError::Internal(format!("Userinfo parse failed: {e}")))
}

// ── User resolution ───────────────────────────────────────────────────────────

async fn resolve_user(db: &sqlx::PgPool, info: &GoogleUserInfo) -> Result<Uuid, AppError> {
    // Check existing oauth_accounts link
    let existing = sqlx::query!(
        "SELECT user_id FROM oauth_accounts WHERE provider = 'google' AND provider_account_id = $1",
        info.id,
    )
    .fetch_optional(db)
    .await?;

    if let Some(row) = existing {
        return Ok(row.user_id);
    }

    // Look up user by email
    let existing_user = sqlx::query!("SELECT id FROM users WHERE email = $1", info.email)
        .fetch_optional(db)
        .await?;

    let user_id = if let Some(u) = existing_user {
        // Link Google account to existing email/password user
        sqlx::query!(
            "INSERT INTO oauth_accounts (user_id, provider, provider_account_id)
             VALUES ($1, 'google', $2)
             ON CONFLICT (provider, provider_account_id) DO NOTHING",
            u.id,
            info.id,
        )
        .execute(db)
        .await?;
        u.id
    } else {
        // New user — create account (email_verified = true, no password)
        let new_user = sqlx::query!(
            "INSERT INTO users (email, email_verified, name)
             VALUES ($1, true, $2)
             ON CONFLICT (email) DO NOTHING
             RETURNING id",
            info.email,
            info.name,
        )
        .fetch_optional(db)
        .await?;

        let id = match new_user {
            Some(u) => u.id,
            // Race condition: re-fetch
            None => {
                sqlx::query!("SELECT id FROM users WHERE email = $1", info.email)
                    .fetch_one(db)
                    .await?
                    .id
            }
        };

        sqlx::query!(
            "INSERT INTO oauth_accounts (user_id, provider, provider_account_id)
             VALUES ($1, 'google', $2)
             ON CONFLICT (provider, provider_account_id) DO NOTHING",
            id,
            info.id,
        )
        .execute(db)
        .await?;

        id
    };

    Ok(user_id)
}
