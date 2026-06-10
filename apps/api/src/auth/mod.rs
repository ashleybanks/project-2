pub mod account;
pub mod handlers;
pub mod mfa;
pub mod middleware;
pub mod oauth;
pub mod reset;
pub mod session;
pub mod verification;

use axum::{Router, routing::{get, post}};
use crate::AppState;

pub fn router(state: AppState) -> Router<AppState> {
    // Account routes — all require auth
    let account_protected = Router::new()
        .route("/account/profile", get(account::get_profile).patch(account::update_profile))
        .route("/account/change-password", post(account::change_password))
        .layer(axum::middleware::from_fn_with_state(
            state.clone(),
            middleware::require_auth,
        ));

    // MFA routes that require an active session
    let mfa_protected = Router::new()
        .route("/mfa/setup",   post(mfa::setup))
        .route("/mfa/confirm", post(mfa::confirm))
        .route("/mfa/disable", post(mfa::disable))
        .layer(axum::middleware::from_fn_with_state(
            state.clone(),
            middleware::require_auth,
        ));

    Router::new()
        // Better Auth wire protocol — /email suffix matches SDK expectations
        .route("/sign-up/email", post(handlers::sign_up))
        .route("/sign-in/email", post(handlers::sign_in))
        .route("/sign-out",      post(handlers::sign_out))
        // Session endpoint — useSession() calls GET /api/auth/get-session
        .route("/get-session",   get(handlers::get_session))
        // Email verification
        .route("/verify-email",        get(handlers::verify_email))
        .route("/resend-verification", post(handlers::resend_verification))
        // Password reset
        .route("/forgot-password",  post(handlers::forgot_password))
        .route("/reset-password",   get(handlers::validate_reset_token).post(handlers::do_reset_password))
        // Google OAuth
        .route("/google",          get(oauth::initiate_google))
        .route("/google/callback", get(oauth::google_callback))
        // MFA — challenge is public; setup/confirm/disable require auth
        .route("/mfa/challenge", post(mfa::challenge))
        .merge(mfa_protected)
        .merge(account_protected)
        .with_state(state)
}
