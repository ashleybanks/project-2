## 1. Database Migration

- [x] 1.1 Add migration: create `password_reset_tokens` table (`id UUID PK`, `user_id UUID FK → users ON DELETE CASCADE`, `token TEXT UNIQUE`, `expires_at TIMESTAMPTZ`, `created_at TIMESTAMPTZ`). Acceptance: migration runs cleanly; `cargo sqlx prepare` succeeds.

## 2. Backend: Reset Token Helpers

- [x] 2.1 Implement `apps/api/src/auth/reset.rs`: `create_token(pool, user_id)` — deletes all existing reset tokens for the user, generates a 64-char hex token, inserts with 1h TTL, returns the token. Acceptance: prior tokens for the user are removed; new token inserted; function returns the token string.
- [x] 2.2 Implement `validate_token(pool, token)` in `reset.rs` — fetches the token row, deletes expired tokens and returns `Err(Unauthorised)`, returns `Ok(user_id)` for a valid unexpired token without deleting it (consumed only on POST). Acceptance: expired token deleted and returns error; unknown token returns error; valid token returns `user_id` and is NOT deleted.
- [x] 2.3 Implement `consume_token(pool, token)` in `reset.rs` — deletes the token and returns `Ok(user_id)`, or `Err(Unauthorised)` if missing/expired. Acceptance: token is deleted on success; subsequent call for same token returns error.

## 3. Backend: Email

- [x] 3.1 Add `send_reset_email(api_key, from, to, token, api_base_url)` to `apps/api/src/email.rs`. HTML body contains a link to `{api_base_url}/api/auth/reset-password?token={token}`. Subject: "Reset your password". Acceptance: calling with a real Resend API key delivers the email to the recipient.

## 4. Backend: Handlers and Routes

- [x] 4.1 Implement `forgot_password` handler: `POST /api/auth/forgot-password` with `{ "email": "..." }` body — looks up user by email; if found, calls `reset::create_token` and `email::send_reset_email` (log errors, don't surface them); always returns `200 {}`. Acceptance: registered email triggers token creation and email send; unregistered email returns 200 silently.
- [x] 4.2 Implement `validate_reset_token` handler: `GET /api/auth/reset-password?token=` — calls `reset::validate_token`; on success redirects to `{frontend_url}/reset-password?token={token}`; on failure redirects to `{frontend_url}/reset-password/error`. Acceptance: valid token → redirect to frontend form with token in URL; expired/unknown → redirect to error page.
- [x] 4.3 Implement `do_reset_password` handler: `POST /api/auth/reset-password` with `{ "token": "...", "password": "..." }` body — calls `reset::consume_token`; on success hashes the new password, updates `users.password_hash`, deletes all sessions for the user (`DELETE FROM sessions WHERE user_id = $1`), redirects to `{frontend_url}/sign-in?reset=true`; on failure redirects to `{frontend_url}/reset-password/error`. Acceptance: valid token → password updated, all sessions deleted, redirect to sign-in; invalid token → redirect to error.
- [x] 4.4 Register `reset` module in `apps/api/src/auth/mod.rs` and mount new routes: `POST /api/auth/forgot-password`, `GET /api/auth/reset-password`, `POST /api/auth/reset-password`. Acceptance: all three routes reachable; router compiles cleanly.

## 5. Frontend: Forgot Password Page

- [x] 5.1 Add `resendPasswordResetEmail(email: string)` and `resetPassword(token: string, password: string)` functions to `apps/web/src/lib/api.ts`. Acceptance: functions call the correct endpoints with credentials; type-check passes.
- [x] 5.2 Create `apps/web/src/pages/ForgotPassword.tsx`: email form that calls `POST /api/auth/forgot-password`; on submit transitions to a "check your email" confirmation state. Acceptance: form renders; submit shows confirmation; no redirect to app.

## 6. Frontend: Reset Password Pages

- [x] 6.1 Create `apps/web/src/pages/ResetPassword.tsx`: reads `?token=` from URL; renders a new-password form (password + confirm password fields, minimum 8 chars); on submit calls `POST /api/auth/reset-password` with the token and new password. On success navigate to `/sign-in?reset=true`; on error navigate to `/reset-password/error`. Acceptance: form validates password match client-side; successful submit lands on sign-in with confirmation; failed submit redirects to error page.
- [x] 6.2 Create `apps/web/src/pages/ResetPasswordError.tsx`: displays an error message ("This reset link has expired or already been used") and a link to `/forgot-password`. Acceptance: page renders with link; TypeScript clean.

## 7. Frontend: Sign-in Updates

- [x] 7.1 Add "Forgot password?" link to `apps/web/src/pages/SignIn.tsx` pointing to `/forgot-password`. Acceptance: link visible below the password field; navigates to `/forgot-password`.
- [x] 7.2 Update `SignIn.tsx` to show a "Password reset successfully. Please sign in." confirmation banner when `?reset=true` is present in the URL. Acceptance: banner shown with `?reset=true`; not shown without the param.

## 8. Frontend: Router

- [x] 8.1 Add `/forgot-password`, `/reset-password`, and `/reset-password/error` routes to `apps/web/src/App.tsx`. Acceptance: all three routes render the correct components; TypeScript type-check passes.

## 9. End-to-End Verification

- [x] 9.1 Verify happy path: click "Forgot password?" → enter email → receive email → click link → enter new password → redirected to sign-in with confirmation → sign in with new password → access app. Acceptance: all steps complete; old password no longer works; sessions from before reset are invalidated.
- [x] 9.2 Verify error paths: expired/used token shows error page with link back to forgot-password; unknown email returns silently; mismatched passwords blocked client-side. Acceptance: all error states handled gracefully.
