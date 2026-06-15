mod handlers;
pub mod render;

use axum::{routing::{get, patch, post}, Router};
use crate::AppState;

/// Routes nested under /api/templates/{id}:
///   POST /jobs          → create_job
///   GET  /jobs          → list_template_jobs
pub fn template_jobs_router(state: AppState) -> Router<AppState> {
    Router::new()
        .route("/jobs", post(handlers::create_job).get(handlers::list_template_jobs))
        .with_state(state)
}

/// Routes under /api/jobs:
///   GET   /{id}                      → get_job
///   POST  /{id}/submit               → submit_job
///   POST  /{id}/items/{item_id}/submit → submit_item
///   GET   /{id}/items/{item_id}/download → download_item
///   GET   /{id}/download             → download_zip
///   PATCH /{id}/active               → set_active
pub fn jobs_router(state: AppState) -> Router<AppState> {
    Router::new()
        .route("/{id}", get(handlers::get_job))
        .route("/{id}/submit", post(handlers::submit_job))
        .route("/{id}/items/{item_id}/submit", post(handlers::submit_item))
        .route("/{id}/items/{item_id}/download", get(handlers::download_item))
        .route("/{id}/download", get(handlers::download_zip))
        .route("/{id}/active", patch(handlers::set_active))
        .with_state(state)
}
