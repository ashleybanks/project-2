## Why

Users can currently sign up and gain immediate access without verifying their email address, meaning accounts can be created with unowned or mistyped addresses. Email verification closes this gap, ensures users can receive transactional email (password reset, notifications), and is a baseline trust requirement before onboarding real users.

## What Changes

- Sign-up no longer creates a session; instead it sends a verification email via Resend and returns a "check your email" state
- A time-limited verification token (24h) is generated on sign-up and stored in a new `email_verification_tokens` table
- New endpoint: `GET /api/auth/verify-email?token=` validates the token, marks the user verified, creates a session, and redirects to the frontend
- New endpoint: `POST /api/auth/resend-verification` accepts an email address and sends a fresh verification token (invalidating any prior one)
- Sign-in for unverified users returns a specific `403 EmailNotVerified` error so the frontend can surface a resend link
- Frontend sign-up flow shows a "check your email" state post-submission
- Frontend sign-in form handles `EmailNotVerified` with a resend verification link
- New frontend route `/verify-email` handles the redirect from the email link (success and error states)
- Resend integration wired via `RESEND_API_KEY` and `FROM_EMAIL` environment variables

## Capabilities

### New Capabilities

- `email-verification`: End-to-end email verification flow covering token generation, Resend email delivery, verification endpoint, resend endpoint, and frontend states

### Modified Capabilities

- `authentication`: Sign-up and sign-in behaviour changes — sign-up no longer auto-authenticates; sign-in gates on `email_verified`

## Impact

- **Backend**: New `email_verification_tokens` table; `users` table gains `email_verified` column; new auth handlers and routes; Resend HTTP client (via `reqwest`)
- **Frontend**: Sign-up form post-submission state; sign-in error handling; new `/verify-email` route
- **Environment**: `RESEND_API_KEY` and `FROM_EMAIL` added to `.env` / `.env.example`
- **Dependencies**: No new Rust crates required (Resend API called via `reqwest`, already in stack); no new npm packages required

## Non-goals

- Rate limiting on resend endpoint (follow-on)
- Email change / re-verification on email update
- MFA or magic link sign-in
- OAuth provider sign-in
- Production email domain setup (config-only change when domain is registered)

## Phase

Phase 1 — prerequisite before real user onboarding.
