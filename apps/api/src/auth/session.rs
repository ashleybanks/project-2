use chrono::{Duration, Utc};
use rand::Rng;
use sqlx::PgPool;
use uuid::Uuid;

use crate::error::AppError;

pub const COOKIE_NAME: &str = "better-auth.session_token";
const SESSION_DURATION_DAYS: i64 = 30;
const TOKEN_BYTES: usize = 32;

pub struct Session {
    pub user_id: Uuid,
    pub email: String,
    pub name: Option<String>,
}

/// Generate a cryptographically random session token.
pub fn generate_token() -> String {
    let bytes: Vec<u8> = (0..TOKEN_BYTES)
        .map(|_| rand::thread_rng().gen::<u8>())
        .collect();
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Create a new session in the database. Returns the opaque token.
pub async fn create(pool: &PgPool, user_id: Uuid) -> Result<String, AppError> {
    let token = generate_token();
    let expires_at = Utc::now() + Duration::days(SESSION_DURATION_DAYS);

    sqlx::query!(
        "INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, $3)",
        user_id,
        token,
        expires_at,
    )
    .execute(pool)
    .await?;

    Ok(token)
}

/// Validate a session token and return the associated user data.
pub async fn validate(pool: &PgPool, token: &str) -> Result<Session, AppError> {
    let row = sqlx::query!(
        r#"
        SELECT s.user_id, s.expires_at, u.email, u.name
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token = $1
        "#,
        token,
    )
    .fetch_optional(pool)
    .await?;

    match row {
        None => Err(AppError::Unauthorised),
        Some(r) if r.expires_at < Utc::now() => {
            // Clean up expired session
            sqlx::query!("DELETE FROM sessions WHERE token = $1", token)
                .execute(pool)
                .await?;
            Err(AppError::Unauthorised)
        }
        Some(r) => Ok(Session {
            user_id: r.user_id,
            email: r.email,
            name: r.name,
        }),
    }
}

/// Delete a session by token (sign-out).
pub async fn delete(pool: &PgPool, token: &str) -> Result<(), AppError> {
    sqlx::query!("DELETE FROM sessions WHERE token = $1", token)
        .execute(pool)
        .await?;
    Ok(())
}
