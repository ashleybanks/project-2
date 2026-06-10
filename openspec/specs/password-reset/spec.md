# Password Reset

## Purpose

Defines requirements for the password reset flow, including the forgot-password endpoint, token-based validation, password update, and frontend pages.

## Requirements

### Requirement: Forgot password request
The system SHALL provide `POST /api/auth/forgot-password` to initiate a password reset. The endpoint SHALL accept an email address, generate a 1h reset token, store it in the `password_reset_tokens` table, and send a reset email via Resend. The endpoint SHALL always return HTTP 200 regardless of whether the email address is registered.

#### Scenario: Reset email sent for registered account
- **WHEN** `POST /api/auth/forgot-password` is called with the email address of a registered account
- **THEN** any prior reset tokens for that user are invalidated, a new token is generated with a 1h TTL, and a reset email is sent containing a link to `GET /api/auth/reset-password?token=`

#### Scenario: Unknown email returns 200 silently
- **WHEN** `POST /api/auth/forgot-password` is called with an email address that is not registered
- **THEN** the endpoint returns HTTP 200 with no indication of whether the email exists

---

### Requirement: Reset token validation redirect
The system SHALL provide `GET /api/auth/reset-password?token=` to validate a reset token before the user enters a new password. On success the browser SHALL be redirected to the frontend reset form. On failure the browser SHALL be redirected to the reset error page.

#### Scenario: Valid token redirects to reset form
- **WHEN** a user navigates to `/api/auth/reset-password?token=<valid-token>`
- **THEN** the browser is redirected to `{frontend_url}/reset-password?token=<token>` (token is NOT consumed)

#### Scenario: Expired token redirects to error
- **WHEN** a user navigates to `/api/auth/reset-password?token=<expired-token>`
- **THEN** the token is deleted and the browser is redirected to `{frontend_url}/reset-password/error`

#### Scenario: Unknown token redirects to error
- **WHEN** a user navigates to `/api/auth/reset-password?token=<unknown-token>`
- **THEN** the browser is redirected to `{frontend_url}/reset-password/error`

---

### Requirement: Password reset submission
The system SHALL provide `POST /api/auth/reset-password` to complete a password reset. The endpoint SHALL accept a token and new password, validate the token, hash and store the new password, invalidate all existing sessions for the user, delete the token, and redirect to the sign-in page.

#### Scenario: Successful password reset
- **WHEN** `POST /api/auth/reset-password` is called with a valid token and a new password
- **THEN** the user's `password_hash` is updated, all sessions for that user are deleted, the reset token is deleted, and the browser is redirected to `{frontend_url}/sign-in?reset=true`

#### Scenario: Expired or already-used token rejected
- **WHEN** `POST /api/auth/reset-password` is called with an expired or already-consumed token
- **THEN** the browser is redirected to `{frontend_url}/reset-password/error`

---

### Requirement: Frontend password reset flow
The React frontend SHALL provide routes and states for the full password reset journey.

#### Scenario: Forgot-password form sends reset request
- **WHEN** a user submits the `/forgot-password` form with their email address
- **THEN** the frontend calls `POST /api/auth/forgot-password` and transitions to a "check your email" confirmation state

#### Scenario: Reset-password form updates password
- **WHEN** a user navigates to `/reset-password?token=` and submits a new password
- **THEN** the frontend calls `POST /api/auth/reset-password` with the token and new password; on success the user is redirected to sign-in; on failure the user is redirected to `/reset-password/error`

#### Scenario: Reset error page links back to forgot-password
- **WHEN** a user navigates to `/reset-password/error`
- **THEN** the frontend displays an error message and a link to `/forgot-password` to start again

#### Scenario: Sign-in page confirms successful reset
- **WHEN** a user is redirected to `/sign-in?reset=true`
- **THEN** the sign-in page displays a confirmation that the password has been reset successfully
