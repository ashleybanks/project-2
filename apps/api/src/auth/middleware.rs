use axum::{
    extract::{Request, State},
    middleware::Next,
    response::Response,
};
use uuid::Uuid;

use crate::{AppState, error::AppError};
use super::{handlers::extract_token, session};

/// Authenticated user injected into request extensions by the auth middleware.
#[derive(Clone)]
pub struct AuthUser {
    pub user_id: Uuid,
    pub email: String,
    pub name: Option<String>,
}

/// Axum middleware that validates the session cookie and injects `AuthUser`
/// into request extensions. Returns 401 if the session is missing or expired.
pub async fn require_auth(
    State(state): State<AppState>,
    mut req: Request,
    next: Next,
) -> Result<Response, AppError> {
    let token = extract_token(req.headers())
        .ok_or(AppError::Unauthorised)?;

    let sess = session::validate(&state.db, &token).await?;

    req.extensions_mut().insert(AuthUser {
        user_id: sess.user_id,
        email: sess.email,
        name: sess.name,
    });

    Ok(next.run(req).await)
}
