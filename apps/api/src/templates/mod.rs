pub mod handlers;

use axum::{
    Router,
    routing::{get, post},
};
use crate::AppState;

pub fn router(state: AppState) -> Router<AppState> {
    Router::new()
        .route("/",              get(handlers::list).post(handlers::create))
        .route("/import",        post(handlers::import_docx))
        .route("/{id}",          get(handlers::get_one).put(handlers::update).delete(handlers::delete_one))
        .route("/{id}/versions", get(handlers::list_versions).post(handlers::create_version))
        .route("/{id}/versions/{version_id}/restore", post(handlers::restore_version))
        .with_state(state)
}
