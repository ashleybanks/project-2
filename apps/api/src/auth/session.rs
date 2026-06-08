use chrono::{DateTime, Duration, Utc};
use rand::Rng;
use sqlx::PgPool;
use uuid::Uuid;

use crate::error::AppError;

pub const COOKIE_NAME: &str = "better-auth.session_token";
const SESSION_DURATION_DAYS: i64 = 30;
const TOKEN_BYTES: usize = 32;

pub struct Session {
    pub session_id: Uuid,
    pub user_id: Uuid,
    pub email: String,
    pub name: Option<String>,
    pub expires_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

pub fn generate_token() -> String {
    let bytes: Vec<u8> = (0..TOKEN_BYTES)
        .map(|_| rand::thread_rng().gen::<u8>())
        .collect();
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

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

pub async fn validate(pool: &PgPool, token: &str) -> Result<Session, AppError> {
    let row = sqlx::query!(
        r#"
        SELECT s.id, s.user_id, s.expires_at, s.created_at, u.email, u.name
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
            sqlx::query!("DELETE FROM sessions WHERE token = $1", token)
                .execute(pool)
                .await?;
            Err(AppError::Unauthorised)
        }
        Some(r) => Ok(Session {
            session_id: r.id,
            user_id: r.user_id,
            email: r.email,
            name: r.name,
            expires_at: r.expires_at,
            created_at: r.created_at,
        }),
    }
}

pub async fn delete(pool: &PgPool, token: &str) -> Result<(), AppError> {
    sqlx::query!("DELETE FROM sessions WHERE token = $1", token)
        .execute(pool)
        .await?;
    Ok(())
}
