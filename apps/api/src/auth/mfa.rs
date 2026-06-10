use axum::{
    body::Body,
    extract::{Extension, State},
    http::{header, StatusCode},
    response::{IntoResponse, Json, Response},
};
use chrono::{Duration, Utc};
use rand::Rng;
use serde::Deserialize;
use totp_rs::{Algorithm, Secret, TOTP};
use uuid::Uuid;

use crate::{AppError, AppState};
use super::middleware::AuthUser;
use super::session;

// ── TOTP helpers ──────────────────────────────────────────────────────────────

fn percent_encode(s: &str) -> String {
    s.chars()
        .flat_map(|c| match c {
            'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '_' | '.' | '~' => {
                vec![c]
            }
            other => format!("%{:02X}", other as u32).chars().collect(),
        })
        .collect()
}

/// Generates a new random TOTP secret, returning (base32_secret, otpauth_uri).
pub fn generate_totp_secret(email: &str) -> (String, String) {
    let secret = Secret::generate_secret();
    let encoded = secret.to_encoded();
    let base32 = match &encoded {
        Secret::Encoded(s) => s.clone(),
        _ => unreachable!(),
    };
    let label = percent_encode(&format!("Project-2:{email}"));
    let uri = format!(
        "otpauth://totp/{label}?secret={base32}&issuer=Project-2&algorithm=SHA1&digits=6&period=30",
    );
    (base32, uri)
}

pub fn verify_totp(secret_base32: &str, code: &str) -> bool {
    let Ok(secret_bytes) = Secret::Encoded(secret_base32.to_string()).to_bytes() else {
        return false;
    };
    let Ok(totp) = TOTP::new(Algorithm::SHA1, 6, 1, 30, secret_bytes) else {
        return false;
    };
    totp.check_current(code).unwrap_or(false)
}

// ── Recovery code helpers ─────────────────────────────────────────────────────

pub fn generate_recovery_codes() -> Vec<String> {
    const CHARSET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let mut rng = rand::thread_rng();
    (0..10)
        .map(|_| {
            (0..8)
                .map(|_| CHARSET[rng.gen_range(0..CHARSET.len())] as char)
                .collect()
        })
        .collect()
}

pub fn hash_recovery_code(code: &str) -> Result<String, AppError> {
    use argon2::{Argon2, PasswordHasher};
    use argon2::password_hash::{rand_core::OsRng, SaltString};
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(code.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|_| AppError::Internal("Recovery code hashing failed".into()))
}

pub fn verify_recovery_code(code: &str, hash: &str) -> bool {
    use argon2::{Argon2, PasswordVerifier};
    use argon2::password_hash::PasswordHash;
    let Ok(parsed) = PasswordHash::new(hash) else {
        return false;
    };
    Argon2::default()
        .verify_password(code.as_bytes(), &parsed)
        .is_ok()
}

// ── 422 helper ────────────────────────────────────────────────────────────────

fn unprocessable(msg: &str) -> Response {
    (
        StatusCode::UNPROCESSABLE_ENTITY,
        Json(serde_json::json!({ "error": msg })),
    )
        .into_response()
}

// ── Handlers ──────────────────────────────────────────────────────────────────

/// POST /api/auth/mfa/setup — generates TOTP secret, stores pending row.
pub async fn setup(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
) -> Result<Json<serde_json::Value>, AppError> {
    let (secret, otpauth_uri) = generate_totp_secret(&user.email);

    sqlx::query!(
        "INSERT INTO user_mfa (user_id, totp_secret, enabled)
         VALUES ($1, $2, false)
         ON CONFLICT (user_id) DO UPDATE SET totp_secret = $2, enabled = false",
        user.user_id,
        secret,
    )
    .execute(&state.db)
    .await?;

    Ok(Json(serde_json::json!({ "secret": secret, "otpauth_uri": otpauth_uri })))
}

#[derive(Deserialize)]
pub struct ConfirmRequest {
    pub code: String,
}

/// POST /api/auth/mfa/confirm — verifies first TOTP code, enables MFA, issues recovery codes.
pub async fn confirm(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Json(body): Json<ConfirmRequest>,
) -> Response {
    let row = sqlx::query!(
        "SELECT totp_secret FROM user_mfa WHERE user_id = $1 AND enabled = false",
        user.user_id,
    )
    .fetch_optional(&state.db)
    .await;

    let Ok(Some(row)) = row else {
        return unprocessable("No pending MFA setup found");
    };

    if !verify_totp(&row.totp_secret, &body.code) {
        return unprocessable("Invalid code");
    }

    // Enable MFA
    if let Err(e) = sqlx::query!(
        "UPDATE user_mfa SET enabled = true WHERE user_id = $1",
        user.user_id,
    )
    .execute(&state.db)
    .await
    {
        tracing::error!("Failed to enable MFA for {}: {e}", user.user_id);
        return AppError::Internal("Failed to enable MFA".into()).into_response();
    }

    // Generate and store recovery codes
    let codes = generate_recovery_codes();
    let _ = sqlx::query!(
        "DELETE FROM mfa_recovery_codes WHERE user_id = $1",
        user.user_id,
    )
    .execute(&state.db)
    .await;

    for code in &codes {
        match hash_recovery_code(code) {
            Ok(hash) => {
                let _ = sqlx::query!(
                    "INSERT INTO mfa_recovery_codes (user_id, code_hash) VALUES ($1, $2)",
                    user.user_id,
                    hash,
                )
                .execute(&state.db)
                .await;
            }
            Err(e) => tracing::error!("Failed to hash recovery code: {e}"),
        }
    }

    Json(serde_json::json!({ "recovery_codes": codes })).into_response()
}

#[derive(Deserialize)]
pub struct ChallengeRequest {
    pub mfa_token: String,
    pub code: String,
}

/// POST /api/auth/mfa/challenge — validates pending token + TOTP/recovery code, creates session.
pub async fn challenge(
    State(state): State<AppState>,
    Json(body): Json<ChallengeRequest>,
) -> Response {
    // Delete pending token immediately (single-use regardless of outcome)
    let pending = sqlx::query!(
        "DELETE FROM mfa_pending_tokens WHERE token = $1 RETURNING user_id, expires_at",
        body.mfa_token,
    )
    .fetch_optional(&state.db)
    .await;

    let Ok(Some(pending)) = pending else {
        return unprocessable("Invalid or expired token");
    };

    if pending.expires_at < Utc::now() {
        return unprocessable("Token expired");
    }

    let user_id = pending.user_id;

    let mfa = sqlx::query!(
        "SELECT totp_secret FROM user_mfa WHERE user_id = $1 AND enabled = true",
        user_id,
    )
    .fetch_optional(&state.db)
    .await;

    let Ok(Some(mfa)) = mfa else {
        return unprocessable("MFA not configured");
    };

    // Try TOTP first (6 digits)
    let valid = if body.code.len() == 6 && body.code.chars().all(|c| c.is_ascii_digit()) {
        verify_totp(&mfa.totp_secret, &body.code)
    } else {
        false
    };

    let valid = if valid {
        true
    } else {
        // Try recovery codes
        let rcs = sqlx::query!(
            "SELECT id, code_hash FROM mfa_recovery_codes WHERE user_id = $1 AND used_at IS NULL",
            user_id,
        )
        .fetch_all(&state.db)
        .await
        .unwrap_or_default();

        let matched = rcs.iter().find(|rc| verify_recovery_code(&body.code, &rc.code_hash));
        if let Some(rc) = matched {
            let _ = sqlx::query!(
                "UPDATE mfa_recovery_codes SET used_at = NOW() WHERE id = $1",
                rc.id,
            )
            .execute(&state.db)
            .await;
            true
        } else {
            false
        }
    };

    if !valid {
        return unprocessable("Invalid code");
    }

    let Ok(session_token) = session::create(&state.db, user_id).await else {
        return AppError::Internal("Session creation failed".into()).into_response();
    };

    let user = sqlx::query!("SELECT id, email, name FROM users WHERE id = $1", user_id)
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten();

    let cookie = format!(
        "{}={session_token}; HttpOnly; SameSite=Lax; Path=/; Max-Age={}",
        session::COOKIE_NAME,
        30 * 24 * 3600,
    );

    axum::http::Response::builder()
        .status(StatusCode::OK)
        .header(header::SET_COOKIE, cookie)
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
            serde_json::to_string(&serde_json::json!({
                "user": {
                    "id":    user.as_ref().map(|u| u.id.to_string()),
                    "email": user.as_ref().map(|u| &u.email),
                    "name":  user.as_ref().and_then(|u| u.name.as_deref()),
                }
            }))
            .unwrap(),
        ))
        .unwrap()
}

#[derive(Deserialize)]
pub struct DisableRequest {
    pub code: String,
}

/// POST /api/auth/mfa/disable — verifies TOTP or recovery code, removes all MFA data.
pub async fn disable(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Json(body): Json<DisableRequest>,
) -> Response {
    let mfa = sqlx::query!(
        "SELECT totp_secret FROM user_mfa WHERE user_id = $1 AND enabled = true",
        user.user_id,
    )
    .fetch_optional(&state.db)
    .await;

    let Ok(Some(mfa)) = mfa else {
        return unprocessable("MFA not enabled");
    };

    let valid_totp = body.code.len() == 6
        && body.code.chars().all(|c| c.is_ascii_digit())
        && verify_totp(&mfa.totp_secret, &body.code);

    let valid = if valid_totp {
        true
    } else {
        let rcs = sqlx::query!(
            "SELECT id, code_hash FROM mfa_recovery_codes WHERE user_id = $1 AND used_at IS NULL",
            user.user_id,
        )
        .fetch_all(&state.db)
        .await
        .unwrap_or_default();

        rcs.iter().any(|rc| verify_recovery_code(&body.code, &rc.code_hash))
    };

    if !valid {
        return unprocessable("Invalid code");
    }

    let _ = sqlx::query!("DELETE FROM mfa_recovery_codes WHERE user_id = $1", user.user_id)
        .execute(&state.db)
        .await;
    let _ = sqlx::query!("DELETE FROM user_mfa WHERE user_id = $1", user.user_id)
        .execute(&state.db)
        .await;

    StatusCode::OK.into_response()
}

// ── Pending token creation (used by sign_in handler) ─────────────────────────

pub async fn create_pending_token(db: &sqlx::PgPool, user_id: Uuid) -> Result<String, AppError> {
    let token = session::generate_token();
    let expires_at = Utc::now() + Duration::minutes(5);
    sqlx::query!(
        "INSERT INTO mfa_pending_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)",
        user_id,
        token,
        expires_at,
    )
    .execute(db)
    .await?;
    Ok(token)
}
