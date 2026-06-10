use axum::{http::StatusCode, response::{IntoResponse, Response}, Json};
use serde_json::json;

#[derive(thiserror::Error, Debug)]
pub enum AppError {
    #[error("Database error: {0}")]
    Sqlx(#[from] sqlx::Error),

    #[error("Unauthorised")]
    Unauthorised,

    #[error("Invalid credentials")]
    InvalidCredentials,

    #[error("Email already in use")]
    EmailInUse,

    #[error("Email not verified")]
    EmailNotVerified,

    #[error("Not found")]
    NotFound,

    #[error("Internal error: {0}")]
    Internal(String),

    #[error("File too large (max 10MB)")]
    FileTooLarge,

    #[error("DOCX parse failed: {0}")]
    DocxParseFailed(String),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        if let AppError::EmailNotVerified = &self {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({
                    "error": "EMAIL_NOT_VERIFIED",
                    "message": "Please verify your email before signing in."
                })),
            )
                .into_response();
        }

        let (status, message) = match &self {
            AppError::Sqlx(e) => {
                tracing::error!("Database error: {e}");
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error".to_string())
            }
            AppError::Unauthorised => (StatusCode::UNAUTHORIZED, self.to_string()),
            AppError::InvalidCredentials => (StatusCode::UNAUTHORIZED, self.to_string()),
            AppError::EmailInUse => (StatusCode::CONFLICT, self.to_string()),
            AppError::EmailNotVerified => unreachable!(),
            AppError::NotFound => (StatusCode::NOT_FOUND, self.to_string()),
            AppError::Internal(msg) => {
                tracing::error!("Internal error: {msg}");
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error".to_string())
            }
            AppError::FileTooLarge => (StatusCode::PAYLOAD_TOO_LARGE, self.to_string()),
            AppError::DocxParseFailed(msg) => {
                tracing::warn!("DOCX parse failed: {msg}");
                (StatusCode::UNPROCESSABLE_ENTITY, self.to_string())
            }
        };

        (status, Json(json!({ "error": message }))).into_response()
    }
}
