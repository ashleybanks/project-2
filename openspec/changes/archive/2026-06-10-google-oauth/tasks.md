## 1. Database Migration

- [x] 1.1 Create migration: add `oauth_accounts` table with columns `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE`, `provider TEXT NOT NULL`, `provider_account_id TEXT NOT NULL`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, and unique constraint on `(provider, provider_account_id)`. Ensure `users.password_hash` is nullable (ALTER COLUMN if needed). Acceptance: `cargo sqlx migrate run` succeeds with no errors.

## 2. AppState & Environment

- [x] 2.1 Add `google_client_id: String` and `google_client_secret: String` fields to `AppState` in `apps/api/src/main.rs`. Read from `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` env vars (panic if missing). Add both vars to `.env.example`. Acceptance: `cargo check` passes; server starts without panicking when vars are set.

## 3. Backend — OAuth Module

- [x] 3.1 Create `apps/api/src/auth/oauth.rs`. Implement `initiate_google` handler: generate 16-byte random hex state, set `oauth_state` cookie (`HttpOnly; SameSite=Lax; Max-Age=300; Path=/`), return `302` redirect to `https://accounts.google.com/o/oauth2/v2/auth` with params `client_id`, `redirect_uri` (`{api_base_url}/api/auth/google/callback`), `response_type=code`, `scope=openid email profile`, `state`. Acceptance: navigating to `/api/auth/google` in a browser redirects to Google's consent screen.

- [x] 3.2 In `apps/api/src/auth/oauth.rs`, implement helper `exchange_code(client_id, client_secret, code, redirect_uri) -> Result<String, AppError>` that POSTs to `https://oauth2.googleapis.com/token` via reqwest and returns the access token. Implement helper `fetch_userinfo(access_token) -> Result<GoogleUserInfo, AppError>` that GETs `https://www.googleapis.com/oauth2/v2/userinfo` and deserialises `{ id, email, verified_email, name }`. Acceptance: helpers compile; unit-testable in isolation.

- [x] 3.3 In `apps/api/src/auth/oauth.rs`, implement `google_callback` handler: extract `code`, `state`, and `error` query params plus `oauth_state` cookie. Reject (redirect to `{frontend_url}/sign-in?error=oauth_failed`) if: `error` param present, state mismatch, or `verified_email` is false. Otherwise: look up existing `oauth_accounts` row by `(provider="google", provider_account_id=google_id)`; if found, use that `user_id`. If not found, look up user by email; if found, insert `oauth_accounts` row. If no user at all, insert new user (`email_verified=true`, `password_hash=NULL`) and insert `oauth_accounts` row. Create session, set session cookie, clear `oauth_state` cookie, redirect to `{frontend_url}/app/templates`. Acceptance: the full flow completes end-to-end in a browser.

## 4. Backend — Router

- [x] 4.1 Add `pub mod oauth;` to `apps/api/src/auth/mod.rs`. Register routes: `GET /google` → `oauth::initiate_google`, `GET /google/callback` → `oauth::google_callback`. Acceptance: `cargo check` passes; routes visible in server startup logs.

## 5. Frontend — Sign-In Page

- [x] 5.1 Add a "Continue with Google" button to `apps/web/src/pages/SignIn.tsx` above the email/password form. The button is an `<a href="/api/auth/google">` (not a React Router `Link`) so it performs a full navigation. Add a divider ("or") between the Google button and the email form. Acceptance: button renders on the sign-in page and navigates to `/api/auth/google` on click.

- [x] 5.2 In `apps/web/src/pages/SignIn.tsx`, read `?error=oauth_failed` from `useSearchParams`. If present, show a red error banner: "Google sign-in failed. Please try again." above the form. Acceptance: banner appears at `/sign-in?error=oauth_failed` and is absent at `/sign-in`.

## 6. Frontend — Sign-Up Page

- [x] 6.1 Add a "Continue with Google" button to `apps/web/src/pages/SignUp.tsx` above the email/password form, with a divider ("or") between them. Same `<a href="/api/auth/google">` pattern as sign-in. Acceptance: button renders on the sign-up page and navigates to `/api/auth/google` on click.

## 7. End-to-End Verification

- [x] 7.1 Test new-user Google sign-up: click "Continue with Google" on sign-up page → complete Google consent → land on `/app/templates`. Verify `users` row has `email_verified=true` and `password_hash=NULL`; `oauth_accounts` row exists with `provider="google"`. Acceptance: full flow completes without error.

- [x] 7.2 Test existing email/password user linking: sign in with Google using the same email as an existing email/password account → land on `/app/templates`. Verify no duplicate `users` row; `oauth_accounts` row inserted. Acceptance: accounts merged, existing data intact.

- [x] 7.3 Test sign-in with already-linked Google account. Acceptance: redirects to `/app/templates`; no duplicate `oauth_accounts` row created.

- [x] 7.4 Test OAuth failure path: simulate state mismatch or Google error → verify redirect to `/sign-in?error=oauth_failed` and error banner shown. Acceptance: no user or session created; error banner visible.
