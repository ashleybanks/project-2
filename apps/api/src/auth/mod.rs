pub mod handlers;
pub mod middleware;
pub mod session;

use axum::{Router, routing::post};
use crate::AppState;

pub fn router(state: AppState) -> Router<AppState> {
    Router::new()
        .route("/sign-up", post(handlers::sign_up))
        .route("/sign-in", post(handlers::sign_in))
        .route("/sign-out", post(handlers::sign_out))
        .with_state(state)
}
