pub mod extractor;
pub mod handlers;
pub mod resolver;
pub mod test_data;

use axum::{
    Router,
    routing::{get, patch, post},
};
use crate::AppState;

pub fn router(state: AppState) -> Router<AppState> {
    Router::new()
        .route("/",                         get(handlers::get_schema)
                                                .post(handlers::upload_schema)
                                                .delete(handlers::delete_schema))
        .route("/resolve",                  post(handlers::trigger_resolve))
        .route("/test-data",                post(handlers::generate_test_data))
        .route("/mappings/{intent_key}",    patch(handlers::patch_mapping))
        .with_state(state)
}
