## Why

Users who forget their password currently have no recovery path — they are locked out permanently. Password reset closes this gap and is a prerequisite for onboarding real users.

## What Changes

- New endpoint: `POST /api/auth/forgot-password` — accepts an email address, generates a 1h reset token stored in a new `password_reset_tokens` table, and sends a reset email via Resend. Always returns 200 regardless of whether the email is registered (no enumeration).
- New endpoint: `GET /api/auth/reset-password?token=` — validates the token server-side; on success redirects the browser to the frontend `/reset-password?token=`; on failure redirects to `/reset-password/error`
- New endpoint: `POST /api/auth/reset-password` — accepts `{ token, password }`; validates the token, hashes and stores the new password, deletes all existing sessions for the user (security invalidation), deletes the token, and redirects to `/sign-in?reset=true`
- New frontend route: `/forgot-password` — email form; shows "check your email" state on submit
- New frontend route: `/reset-password?token=` — new password form; posts to backend; shows error on failure
- New frontend route: `/reset-password/error` — invalid or expired token page with a link back to `/forgot-password`
- Sign-in page updated to show a "Password reset successfully" confirmation banner when `?reset=true` is present in the URL
- "Forgot password?" link added to the sign-in form

## Capabilities

### New Capabilities

- `password-reset`: End-to-end password reset flow covering token generation, Resend email delivery, token validation redirect, password update with session invalidation, and frontend states

### Modified Capabilities

- `authentication`: Sign-in page gains a "Forgot password?" link and a post-reset confirmation state

## Impact

- **Backend**: New `password_reset_tokens` table; new auth handlers and routes; reuses existing Resend/AppState email infrastructure
- **Frontend**: Three new routes; sign-in form updated
- **Dependencies**: None new — Resend, reqwest, argon2, sqlx all already in stack

## Non-goals

- Rate limiting on forgot-password endpoint
- Password strength enforcement beyond the existing 8-character minimum
- Notifying the user of sign-in from a new device after reset
- Account lockout after repeated failed attempts

## Phase

Phase 1 — prerequisite before real user onboarding.
