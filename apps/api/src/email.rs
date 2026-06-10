use crate::error::AppError;

async fn resend_post(api_key: &str, payload: serde_json::Value) -> Result<(), AppError> {
    let client = reqwest::Client::new();
    let res = client
        .post("https://api.resend.com/emails")
        .header("Authorization", format!("Bearer {api_key}"))
        .json(&payload)
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("Email send failed: {e}")))?;

    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        return Err(AppError::Internal(format!("Resend API error {status}: {body}")));
    }

    Ok(())
}

pub async fn send_verification_email(
    api_key: &str,
    from: &str,
    to: &str,
    token: &str,
    api_base_url: &str,
) -> Result<(), AppError> {
    let verification_url = format!("{api_base_url}/api/auth/verify-email?token={token}");

    let html = format!(
        r#"<p>Thanks for signing up! Please verify your email address by clicking the link below:</p>
<p><a href="{verification_url}">Verify email address</a></p>
<p>This link expires in 24 hours.</p>
<p>If you didn't create an account, you can safely ignore this email.</p>"#
    );

    resend_post(api_key, serde_json::json!({
        "from": from,
        "to": [to],
        "subject": "Verify your email address",
        "html": html,
    }))
    .await
}

pub async fn send_reset_email(
    api_key: &str,
    from: &str,
    to: &str,
    token: &str,
    api_base_url: &str,
) -> Result<(), AppError> {
    let reset_url = format!("{api_base_url}/api/auth/reset-password?token={token}");

    let html = format!(
        r#"<p>We received a request to reset your password. Click the link below to choose a new one:</p>
<p><a href="{reset_url}">Reset password</a></p>
<p>This link expires in 1 hour.</p>
<p>If you didn't request a password reset, you can safely ignore this email.</p>"#
    );

    resend_post(api_key, serde_json::json!({
        "from": from,
        "to": [to],
        "subject": "Reset your password",
        "html": html,
    }))
    .await
}
