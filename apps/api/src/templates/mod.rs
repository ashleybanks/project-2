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
        .with_state(state)
}
