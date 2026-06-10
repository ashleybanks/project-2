## Why

Users currently can only authenticate with email and password. Adding Google OAuth removes signup friction — users can onboard with a single click and skip email verification entirely, since Google-authenticated emails are inherently verified.

## What Changes

- New endpoint `GET /api/auth/google` initiates the OAuth 2.0 authorization code flow, generating a random state token for CSRF protection and redirecting to Google's authorization URL
- New endpoint `GET /api/auth/google/callback` handles the callback: exchanges the authorization code for tokens, fetches the user's Google profile, then either signs in an existing user, links the Google account to an existing email/password user, or creates a new account
- New `oauth_accounts` table: `(id, user_id, provider, provider_account_id, created_at)` — links a Google account to an internal user
- Accounts created via Google have `email_verified = true` and no `password_hash`
- Existing email+password users who sign in with Google using the same email get their Google account linked automatically (no duplicate accounts)
- Sign-in and sign-up pages both gain a "Continue with Google" button that navigates to `/api/auth/google`
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` added to env and `AppState`
- OAuth state stored in a short-lived cookie for CSRF validation on callback

## Capabilities

### New Capabilities

- `google-oauth`: End-to-end Google OAuth flow — initiation, callback, account creation/linking, session creation, and frontend entry points on sign-in and sign-up pages

### Modified Capabilities

- `authentication`: Sign-in and sign-up pages gain a Google OAuth entry point

## Impact

- **Backend**: New migration (`oauth_accounts` table); two new Axum route handlers; `AppState` gains `google_client_id`, `google_client_secret`; pure `reqwest` HTTP calls to Google token and userinfo endpoints — no new crates required
- **Frontend**: Sign-in and sign-up pages gain a "Continue with Google" button; no new npm packages required (redirect-based flow, no PKCE client logic)
- **Environment**: `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` added to `.env` / `.env.example`
- **Google Cloud**: OAuth 2.0 client credentials must be configured in Google Cloud Console with the callback URL registered

## Non-goals

- Other OAuth providers (GitHub, Apple, etc.) — architecture supports them but out of scope here
- Account unlinking (removing a connected Google account)
- Forcing re-authentication before sensitive operations
- MFA — separate change

## Phase

Phase 1 — reduces onboarding friction before real user acquisition.
