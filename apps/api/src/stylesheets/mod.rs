pub mod handlers;

use axum::{Router, routing::get};
use crate::AppState;

pub fn router(state: AppState) -> Router<AppState> {
    Router::new()
        .route("/brand-rules", get(handlers::get_brand_rules).put(handlers::put_brand_rules))
        .with_state(state)
}
