use chrono::{Duration, Utc};
use rand::Rng;
use sqlx::PgPool;
use uuid::Uuid;

use crate::error::AppError;

const RESET_TTL_HOURS: i64 = 1;
const TOKEN_BYTES: usize = 32;

fn generate_token() -> String {
    let bytes: Vec<u8> = (0..TOKEN_BYTES)
        .map(|_| rand::thread_rng().gen::<u8>())
        .collect();
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Invalidates any existing reset tokens for the user, creates a fresh one, and returns it.
pub async fn create_token(pool: &PgPool, user_id: Uuid) -> Result<String, AppError> {
    let token = generate_token();
    let expires_at = Utc::now() + Duration::hours(RESET_TTL_HOURS);

    sqlx::query!(
        "DELETE FROM password_reset_tokens WHERE user_id = $1",
        user_id,
    )
    .execute(pool)
    .await?;

    sqlx::query!(
        "INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)",
        user_id,
        token,
        expires_at,
    )
    .execute(pool)
    .await?;

    Ok(token)
}

/// Validates the token without consuming it. Returns user_id on success.
/// Deletes and errors on expiry; errors on unknown token.
pub async fn validate_token(pool: &PgPool, token: &str) -> Result<Uuid, AppError> {
    let row = sqlx::query!(
        "SELECT user_id, expires_at FROM password_reset_tokens WHERE token = $1",
        token,
    )
    .fetch_optional(pool)
    .await?;

    match row {
        None => Err(AppError::Unauthorised),
        Some(r) if r.expires_at < Utc::now() => {
            sqlx::query!(
                "DELETE FROM password_reset_tokens WHERE token = $1",
                token,
            )
            .execute(pool)
            .await?;
            Err(AppError::Unauthorised)
        }
        Some(r) => Ok(r.user_id),
    }
}

/// Consumes the token (deletes it) and returns the user_id. Errors if missing or expired.
pub async fn consume_token(pool: &PgPool, token: &str) -> Result<Uuid, AppError> {
    let user_id = validate_token(pool, token).await?;

    sqlx::query!(
        "DELETE FROM password_reset_tokens WHERE token = $1",
        token,
    )
    .execute(pool)
    .await?;

    Ok(user_id)
}
