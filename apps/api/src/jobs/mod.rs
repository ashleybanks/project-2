mod handlers;
pub mod render;

use axum::{routing::{get, post}, Router};
use crate::AppState;

pub fn router(state: AppState) -> Router<AppState> {
    Router::new()
        .route("/", post(handlers::generate))
        .with_state(state)
}

pub fn jobs_router(state: AppState) -> Router<AppState> {
    Router::new()
        .route("/{id}", get(handlers::get_job))
        .route("/{id}/download", get(handlers::download))
        .with_state(state)
}
