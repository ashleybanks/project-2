pub mod handlers;
pub mod middleware;
pub mod session;

use axum::{Router, routing::{get, post}};
use crate::AppState;

pub fn router(state: AppState) -> Router<AppState> {
    Router::new()
        // Better Auth wire protocol — /email suffix matches SDK expectations
        .route("/sign-up/email", post(handlers::sign_up))
        .route("/sign-in/email", post(handlers::sign_in))
        .route("/sign-out",      post(handlers::sign_out))
        // Session endpoint — useSession() calls GET /api/auth/session
        .route("/get-session",   get(handlers::get_session))
        .with_state(state)
}
