use axum::{
    extract::Extension,
    http::{header, HeaderValue, Method},
    middleware,
    response::{IntoResponse, Json, Response},
    routing::get,
    Router,
};
use serde_json::json;
use sqlx::postgres::PgPoolOptions;
use std::net::SocketAddr;
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod auth;
mod docx;
mod email;
mod error;
mod stylesheets;
mod templates;

pub use error::AppError;

#[derive(Clone)]
pub struct AppState {
    pub db: sqlx::PgPool,
    pub resend_api_key: String,
    pub from_email: String,
    pub api_base_url: String,
    pub frontend_url: String,
    pub google_client_id: String,
    pub google_client_secret: String,
}

#[tokio::main]
async fn main() {
    // Load .env from repo root
    dotenvy::from_path("../../.env").ok();
    dotenvy::dotenv().ok();

    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "api=debug,tower_http=debug".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let resend_api_key = std::env::var("RESEND_API_KEY").expect("RESEND_API_KEY must be set");
    let from_email = std::env::var("FROM_EMAIL").expect("FROM_EMAIL must be set");
    let api_base_url = std::env::var("API_BASE_URL")
        .unwrap_or_else(|_| "http://localhost:3000".into());
    let frontend_url = std::env::var("FRONTEND_URL")
        .unwrap_or_else(|_| "http://localhost:5173".into());
    let google_client_id = std::env::var("GOOGLE_CLIENT_ID").expect("GOOGLE_CLIENT_ID must be set");
    let google_client_secret = std::env::var("GOOGLE_CLIENT_SECRET").expect("GOOGLE_CLIENT_SECRET must be set");

    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(&database_url)
        .await
        .expect("Failed to connect to PostgreSQL");

    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("Failed to run migrations");

    let state = AppState {
        db: pool,
        resend_api_key,
        from_email,
        api_base_url,
        frontend_url,
        google_client_id,
        google_client_secret,
    };

    // Protected routes — require a valid session
    let protected = Router::new()
        .route("/api/me", get(me))
        .nest("/api/templates", templates::router(state.clone()))
        .nest("/api/stylesheets", stylesheets::router(state.clone()))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            auth::middleware::require_auth,
        ));

    let app = Router::new()
        .merge(protected)
        .nest("/api/auth", auth::router(state.clone()))
        .route("/api/health", get(health))
        .route("/api/render/test", get(render_test))
        .layer(
            CorsLayer::new()
                .allow_origin(
                    std::env::var("CORS_ORIGIN")
                        .unwrap_or_else(|_| "http://localhost:5173".into())
                        .parse::<HeaderValue>()
                        .expect("invalid CORS_ORIGIN"),
                )
                .allow_credentials(true)
                .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE, Method::OPTIONS])
                .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION, header::COOKIE]),
        )
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let addr = SocketAddr::from(([127, 0, 0, 1], 3000));
    tracing::info!("API listening on {addr}");

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn render_test() -> Response {
    use typst_compiler::{compile, render};
    use serde_json::json;

    let payload = json!({
        "customer": { "name": "Acme Corp" },
        "invoice": {
            "number": "INV-2026-001",
            "status": "paid",
            "items": [
                { "description": "Consulting (10h)", "unit_price": 1500.00 },
                { "description": "Expenses",          "unit_price": 87.50  }
            ]
        }
    });

    let model = typst_compiler::model::spike_model();
    let source = compile(&model);

    match render(&source, &payload) {
        Ok(pdf_bytes) => (
            [(header::CONTENT_TYPE, "application/pdf")],
            pdf_bytes,
        ).into_response(),
        Err(e) => (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        ).into_response(),
    }
}

async fn health() -> Json<serde_json::Value> {
    Json(json!({ "status": "ok" }))
}

async fn me(
    Extension(user): Extension<auth::middleware::AuthUser>,
) -> Json<serde_json::Value> {
    Json(json!({
        "id":    user.user_id,
        "email": user.email,
        "name":  user.name,
    }))
}
