use chrono::{Duration, Utc};
use rand::Rng;
use sqlx::PgPool;
use uuid::Uuid;

use crate::error::AppError;

const VERIFICATION_TTL_HOURS: i64 = 24;
const TOKEN_BYTES: usize = 32;

fn generate_token() -> String {
    let bytes: Vec<u8> = (0..TOKEN_BYTES)
        .map(|_| rand::thread_rng().gen::<u8>())
        .collect();
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Invalidates any existing tokens for the user, creates a fresh one, and returns it.
pub async fn create_token(pool: &PgPool, user_id: Uuid) -> Result<String, AppError> {
    let token = generate_token();
    let expires_at = Utc::now() + Duration::hours(VERIFICATION_TTL_HOURS);

    sqlx::query!(
        "DELETE FROM email_verification_tokens WHERE user_id = $1",
        user_id,
    )
    .execute(pool)
    .await?;

    sqlx::query!(
        "INSERT INTO email_verification_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)",
        user_id,
        token,
        expires_at,
    )
    .execute(pool)
    .await?;

    Ok(token)
}

/// Validates the token. Deletes it (whether valid or expired). Returns the user_id on success.
pub async fn validate_token(pool: &PgPool, token: &str) -> Result<Uuid, AppError> {
    let row = sqlx::query!(
        "SELECT user_id, expires_at FROM email_verification_tokens WHERE token = $1",
        token,
    )
    .fetch_optional(pool)
    .await?;

    match row {
        None => Err(AppError::Unauthorised),
        Some(r) => {
            sqlx::query!(
                "DELETE FROM email_verification_tokens WHERE token = $1",
                token,
            )
            .execute(pool)
            .await?;

            if r.expires_at < Utc::now() {
                Err(AppError::Unauthorised)
            } else {
                Ok(r.user_id)
            }
        }
    }
}
