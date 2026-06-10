## Context

The auth system uses pure Rust (argon2 + sqlx + PostgreSQL sessions table) with no third-party auth library. Email/password sign-up, sign-in, email verification, and password reset are all implemented. reqwest is already in the stack (used for Resend email calls), so no new crate is needed — Google's token exchange and userinfo endpoints are called directly.

## Goals / Non-Goals

**Goals:**
- Users can sign up and sign in with their Google account via authorization code flow
- Existing email/password users who authenticate with Google using the same email get linked automatically
- Google-created accounts are pre-verified (`email_verified = true`, `password_hash = NULL`)
- CSRF protection via state parameter stored in a short-lived cookie
- No new crate dependencies

**Non-Goals:**
- Other OAuth providers
- Account unlinking
- PKCE (not required for server-side authorization code flow — client secret stays on server)
- Forcing re-authentication before sensitive operations

## Decisions

### Server-side authorization code flow
The frontend never handles tokens. It navigates to `GET /api/auth/google`; the backend manages the entire exchange. The callback URL points to the backend, which creates a session and redirects the browser to the frontend. No PKCE required.

### State in a short-lived HTTP-only cookie
On `/api/auth/google`, generate a random 16-byte hex state string, set it as `oauth_state` cookie (`HttpOnly; SameSite=Lax; Max-Age=300; Path=/`), and include it in the Google authorization URL. On callback, compare `state` query param against the cookie, clear the cookie, and reject if they don't match.

**Alternative considered:** Store state in a DB table (like verification tokens). Rejected — unnecessary DB write for a 5-minute value; a self-contained cookie is simpler and equally secure.

**Why `SameSite=Lax` not `Strict`:** The OAuth callback is a top-level GET redirect from Google. `Strict` would block cookie transmission on cross-origin redirects. `Lax` allows it.

### Account linking by email
If the Google `email` matches an existing user and `email_verified: true` in Google's userinfo response, the Google account is linked to that user automatically and a session is created. No confirmation prompt.

**Alternative considered:** Require password sign-in first to confirm ownership before linking. Rejected — Google has already verified the email address; an additional password prompt adds friction with no meaningful security benefit.

**Important:** If Google returns `email_verified: false`, do NOT link to any existing account and reject the sign-in attempt.

### `oauth_accounts` table
A separate table `(id, user_id, provider, provider_account_id, created_at)` stores provider linkage. Extensible to future providers without touching `users`.

**Alternative considered:** Add `google_id` column to `users`. Rejected — doesn't scale to multiple providers.

### `password_hash` nullability
Users created via Google have no password. `users.password_hash` must be nullable. The migration confirms this (adding a `NOT NULL` fallback is a separate concern for the account page feature).

### Redirect destinations
- Success: `{frontend_url}/app/templates`
- Failure (any error): `{frontend_url}/sign-in?error=oauth_failed`

A minimal `?error=oauth_failed` banner on the sign-in page handles user-facing failure messaging without adding a dedicated error route.

## Risks / Trade-offs

- **Email spoofing via unverified Google email**: Google's `email_verified` field can be `false`. If we auto-link on unverified emails, a malicious actor could claim an existing user's email. → Mitigation: check `email_verified` in userinfo response; reject if false.
- **Race condition on concurrent callbacks**: Two simultaneous OAuth callbacks for the same new email could attempt concurrent `INSERT INTO users`. → Mitigation: `users.email` has a unique constraint; use `INSERT ... ON CONFLICT DO NOTHING` + re-fetch to handle gracefully.
- **State cookie timing**: If a user takes more than 5 minutes between initiating OAuth and completing the Google flow, the state cookie expires and the callback will fail. → Acceptable trade-off; user sees the `oauth_failed` error and can retry.

## Migration Plan

1. Migration: create `oauth_accounts` table; ensure `users.password_hash` is nullable
2. Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to env / `AppState`
3. Register `{api_base_url}/api/auth/google/callback` in Google Cloud Console
4. Deploy backend with new routes
5. Deploy frontend with "Continue with Google" buttons

**Rollback:** Remove the two routes and env vars. The `oauth_accounts` table and any linked accounts can remain — no user data is at risk.

## Open Questions

None — all key decisions are resolved above.
