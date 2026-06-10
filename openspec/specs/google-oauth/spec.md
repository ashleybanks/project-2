# Google OAuth

## Purpose

Defines requirements for Google OAuth 2.0 sign-in and sign-up, including the authorization flow, callback handling, account creation and linking, and CSRF protection.

## Requirements

### Requirement: OAuth initiation
The system SHALL provide `GET /api/auth/google` to begin the Google OAuth 2.0 authorization code flow. The endpoint SHALL generate a random state token, store it in a short-lived `oauth_state` HTTP-only cookie (`SameSite=Lax; Max-Age=300`), and redirect the browser to Google's authorization endpoint with the required parameters (`client_id`, `redirect_uri`, `response_type=code`, `scope=openid email profile`, `state`).

#### Scenario: Initiation redirects to Google
- **WHEN** a user navigates to `GET /api/auth/google`
- **THEN** the browser is redirected to `https://accounts.google.com/o/oauth2/v2/auth` with valid OAuth parameters and the `oauth_state` cookie is set

---

### Requirement: OAuth callback — new user
The system SHALL handle `GET /api/auth/google/callback` for users whose Google email is not registered. The handler SHALL validate the state parameter against the `oauth_state` cookie, exchange the authorization code for tokens, fetch the user's profile from Google's userinfo endpoint, create a new user record (`email_verified = true`, `password_hash = NULL`), insert a row into `oauth_accounts`, create a session, and redirect to the application.

#### Scenario: New user created and signed in
- **WHEN** `GET /api/auth/google/callback` is called with a valid code and state for an unregistered email
- **THEN** a new user is created with `email_verified = true` and no password, an `oauth_accounts` row is inserted, a session is created with an HTTP-only cookie, and the browser is redirected to `{frontend_url}/app/templates`

#### Scenario: CSRF state mismatch rejected
- **WHEN** `GET /api/auth/google/callback` is called with a `state` value that does not match the `oauth_state` cookie
- **THEN** no user or session is created and the browser is redirected to `{frontend_url}/sign-in?error=oauth_failed`

#### Scenario: Google error response handled
- **WHEN** Google redirects back with an `error` parameter instead of a `code`
- **THEN** no user or session is created and the browser is redirected to `{frontend_url}/sign-in?error=oauth_failed`

#### Scenario: Unverified Google email rejected
- **WHEN** Google's userinfo response contains `email_verified: false`
- **THEN** no user or session is created and the browser is redirected to `{frontend_url}/sign-in?error=oauth_failed`

---

### Requirement: OAuth callback — existing user (sign in)
If the Google email matches an existing user and Google reports `email_verified: true`, the system SHALL link the Google account to the existing user (if not already linked), create a session, and redirect to the application. No password is required.

#### Scenario: Existing user signed in via Google
- **WHEN** `GET /api/auth/google/callback` is called for an email that already exists in `users`
- **THEN** an `oauth_accounts` row is upserted, a session is created, and the browser is redirected to `{frontend_url}/app/templates`

#### Scenario: Already-linked account signs in again
- **WHEN** a user who has previously signed in with Google authenticates again
- **THEN** the existing `oauth_accounts` row is unchanged, a new session is created, and the browser is redirected to `{frontend_url}/app/templates`

---

### Requirement: OAuth accounts table
The system SHALL maintain an `oauth_accounts` table with columns `(id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, provider TEXT NOT NULL, provider_account_id TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())` and a unique constraint on `(provider, provider_account_id)`.

#### Scenario: Duplicate provider account rejected at DB level
- **WHEN** an insert into `oauth_accounts` is attempted with a `(provider, provider_account_id)` pair that already exists
- **THEN** the database unique constraint prevents a duplicate row

---

### Requirement: Sign-in error banner for OAuth failure
The sign-in page SHALL display a brief error message when the URL contains `?error=oauth_failed`.

#### Scenario: Error banner shown after OAuth failure
- **WHEN** a user is redirected to `/sign-in?error=oauth_failed`
- **THEN** the sign-in page displays a message indicating that Google sign-in failed and the user should try again

#### Scenario: No error banner without error param
- **WHEN** a user navigates to `/sign-in` without `?error=oauth_failed`
- **THEN** no OAuth error message is shown
