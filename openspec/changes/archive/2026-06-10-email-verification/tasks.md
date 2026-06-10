## 1. Database Migration

- [x] 1.1 Add migration: `ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT false`. Acceptance: migration runs cleanly; existing rows default to `false`; `cargo sqlx prepare` succeeds.
- [x] 1.2 Add migration: create `email_verification_tokens` table (`id UUID PK`, `user_id UUID FK → users`, `token TEXT UNIQUE`, `expires_at TIMESTAMPTZ`, `created_at TIMESTAMPTZ`). Acceptance: table created; `ON DELETE CASCADE` on `user_id`; migration idempotent.

## 2. Backend: Email Module

- [x] 2.1 Add `RESEND_API_KEY` and `FROM_EMAIL` to `.env.example` with placeholder values. Read both from environment at startup and add to `AppState`. Acceptance: server fails to start with a clear error if either variable is missing.
- [x] 2.2 Implement `apps/api/src/email.rs`: async `send_verification_email(to: &str, token: &str, base_url: &str)` that posts to the Resend API via `reqwest`. HTML body contains a link to `{base_url}/api/auth/verify-email?token={token}`. Acceptance: calling the function with a real Resend API key delivers the email; missing API key returns an `AppError`.

## 3. Backend: Verification Token Helpers

- [x] 3.1 Implement `apps/api/src/auth/verification.rs`: `create_token(pool, user_id)` — deletes all existing tokens for the user, generates a 64-char hex token (same approach as sessions), inserts with 24h TTL, returns the token. Acceptance: prior tokens for the user are removed; new token inserted; function returns the token string.
- [x] 3.2 Implement `validate_token(pool, token)` in `verification.rs` — fetches the token row joined with user, deletes expired tokens and returns `Err(Unauthorised)`, returns `Ok(user_id)` for a valid token. Acceptance: expired token is deleted and returns error; unknown token returns error; valid token returns `user_id`.

## 4. Backend: Auth Handler Changes

- [x] 4.1 Update `sign_up` handler: remove session creation; call `verification::create_token` and `email::send_verification_email`; return `201` with `{ "message": "check_your_email" }` body. Acceptance: `POST /api/auth/sign-up` returns 201 with no `Set-Cookie` header; a verification email is delivered to the registered address.
- [x] 4.2 Update `sign_in` handler: after credential validation, check `email_verified`; if `false`, return `403` with `{ "error": "EMAIL_NOT_VERIFIED", "message": "Please verify your email before signing in." }`. Acceptance: unverified user gets 403 with `EMAIL_NOT_VERIFIED`; verified user signs in normally.
- [x] 4.3 Implement `verify_email` handler: `GET /api/auth/verify-email?token=` — calls `validation::validate_token`, sets `email_verified = true`, creates a session, sets cookie, redirects to `/?verified=true` on success; redirects to `/verify-email/error` on failure. Acceptance: valid token → session cookie set, redirect to `/?verified=true`; expired/unknown token → redirect to `/verify-email/error`.
- [x] 4.4 Implement `resend_verification` handler: `POST /api/auth/resend-verification` with `{ "email": "..." }` body — looks up user by email; if found and unverified, calls `create_token` and `send_verification_email`; always returns `200 {}`. Acceptance: unverified user receives a new email and old tokens are invalidated; unknown or verified email returns 200 with no error.
- [x] 4.5 Mount new routes in the Axum router: `GET /api/auth/verify-email` and `POST /api/auth/resend-verification`. Acceptance: both routes are reachable; router compiles cleanly.

## 5. Frontend: Sign-up Flow

- [x] 5.1 Update sign-up form component: on successful `201` response, transition to a "check your email" state (show message, not a redirect to the app). Acceptance: successful sign-up shows the check-your-email message; no redirect to `/app`.
- [x] 5.2 Handle Resend API failure case in sign-up: if the response indicates the email couldn't be sent, show a message directing the user to request a resend. Acceptance: error state is visible and actionable.

## 6. Frontend: Sign-in Flow

- [x] 6.1 Update sign-in form error handling: detect `EMAIL_NOT_VERIFIED` error code in the response and display a "please verify your email" message with a "resend verification email" link/button. Acceptance: unverified sign-in shows the message and a working resend trigger.
- [x] 6.2 Implement the resend action: clicking the resend button calls `POST /api/auth/resend-verification` with the email address from the sign-in form. Show a confirmation message on success. Acceptance: button calls the endpoint; confirmation shown; no duplicate requests on repeated clicks.

## 7. Frontend: Verify-email Route

- [x] 7.1 Add `/verify-email/error` route: displays an error message and a form to enter an email address and request a new verification link. Acceptance: route renders; form calls `POST /api/auth/resend-verification`; confirmation shown on success.
- [x] 7.2 Handle `/?verified=true` on the app root/landing route: show a brief "email verified" confirmation message on first load. Acceptance: `/?verified=true` shows the confirmation; navigating to `/` without the param does not.

## 8. End-to-End Verification

- [x] 8.1 Verify full happy path in browser: sign up → check-your-email state → click link in email → redirect to app with verified confirmation → sign out → sign in → access app. Acceptance: all steps complete without error; `email_verified = true` in DB after clicking link; session present after verification.
- [x] 8.2 Verify error paths: expired token redirects to error page; resend from error page delivers new email; unverified sign-in shows resend link and resend delivers email. Acceptance: all error scenarios handled gracefully with no unhandled states.

