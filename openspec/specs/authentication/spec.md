# Authentication

## Purpose

Defines requirements for user authentication, including registration, sign-in, session management, sign-out, and frontend route protection.

## Requirements

### Requirement: User registration
The system SHALL allow a new user to create an account using an email address and password. The password SHALL be hashed server-side before storage. Duplicate email addresses SHALL be rejected with a clear error. On successful registration, a verification email SHALL be sent and no session SHALL be created. The user SHALL be required to verify their email before gaining access to the application.

#### Scenario: Successful registration
- **WHEN** a user submits a valid email and password via the sign-up form
- **THEN** an account is created with `email_verified = false`, a verification email is sent via Resend, and the response indicates the user should check their email (no session cookie is set)

#### Scenario: Duplicate email rejected
- **WHEN** a user attempts to register with an email address already in use
- **THEN** the system SHALL return an error indicating the email is already registered, without revealing whether a password exists

#### Scenario: Invalid input rejected
- **WHEN** a user submits a registration form with a missing email or password below minimum length
- **THEN** the system SHALL return field-level validation errors before any server request is made

---

### Requirement: User sign-in
The system SHALL allow a registered, verified user to sign in with their email and password. On success, if MFA is not enabled, a server-side session SHALL be created and an HTTP-only session cookie SHALL be set. If MFA is enabled, a short-lived `mfa_token` SHALL be issued and `{ mfa_required: true, mfa_token }` returned with no session cookie — the session is created only after a successful MFA challenge. Unverified users SHALL be rejected with a distinct error code.

#### Scenario: Successful sign-in without MFA
- **WHEN** a registered, verified user with MFA disabled submits valid credentials
- **THEN** a session is created in PostgreSQL, an HTTP-only cookie is set, and the user is redirected to the application

#### Scenario: Sign-in with MFA enabled returns challenge token
- **WHEN** a registered, verified user with MFA enabled submits valid credentials
- **THEN** no session is created, no cookie is set, and the response contains `{ mfa_required: true, mfa_token }` with HTTP 200

#### Scenario: Invalid credentials rejected
- **WHEN** a user submits an unrecognised email or incorrect password
- **THEN** the system SHALL return a generic "invalid credentials" error (no indication of which field is wrong)

#### Scenario: Unverified account rejected
- **WHEN** a registered but unverified user submits valid credentials
- **THEN** the system SHALL return HTTP 403 with error code `EMAIL_NOT_VERIFIED` and no session is created

#### Scenario: Session persists across page reload
- **WHEN** an authenticated user reloads the browser
- **THEN** the session cookie is sent automatically and the user remains authenticated without re-entering credentials

---

### Requirement: Session validation on protected routes
The Axum backend SHALL validate the session cookie on every request to a protected route. Requests with a missing, expired, or invalid session SHALL be rejected with HTTP 401.

#### Scenario: Valid session grants access
- **WHEN** an authenticated request is made to a protected Axum route with a valid session cookie
- **THEN** the request is processed and the authenticated user's ID is available to the handler

#### Scenario: Missing session rejected
- **WHEN** a request is made to a protected route with no session cookie
- **THEN** the system SHALL return HTTP 401 with a structured JSON error body

#### Scenario: Expired session rejected
- **WHEN** a request is made to a protected route with a session that has passed its expiry time
- **THEN** the system SHALL return HTTP 401 and the session row SHALL be absent or marked expired in PostgreSQL

---

### Requirement: User sign-out
The system SHALL allow an authenticated user to sign out. On sign-out, the session SHALL be invalidated server-side and the session cookie SHALL be cleared.

#### Scenario: Successful sign-out
- **WHEN** an authenticated user triggers sign-out
- **THEN** the session row is deleted from PostgreSQL, the cookie is cleared, and the user is redirected to the sign-in page

#### Scenario: Post-sign-out requests rejected
- **WHEN** a request is made to a protected route after sign-out using the former session cookie
- **THEN** the system SHALL return HTTP 401 (session no longer exists in PostgreSQL)

---

### Requirement: Frontend route protection
The React frontend SHALL prevent unauthenticated users from accessing application routes. Unauthenticated users SHALL be redirected to the sign-in page.

#### Scenario: Unauthenticated access redirected
- **WHEN** an unauthenticated user navigates directly to a protected application route
- **THEN** the frontend SHALL redirect to the sign-in page, preserving the intended destination for post-login redirect

#### Scenario: Authenticated user accesses protected route
- **WHEN** an authenticated user navigates to a protected application route
- **THEN** the route renders normally without redirection

---

### Requirement: Forgot password entry point
The sign-in page SHALL display a "Forgot password?" link that navigates to `/forgot-password`.

#### Scenario: Forgot password link visible on sign-in page
- **WHEN** a user views the sign-in page
- **THEN** a "Forgot password?" link is visible and navigates to `/forgot-password`

---

### Requirement: Post-reset sign-in confirmation
The sign-in page SHALL display a success confirmation when the user arrives from a completed password reset (i.e. `?reset=true` in the URL).

#### Scenario: Confirmation shown after reset
- **WHEN** a user is redirected to `/sign-in?reset=true`
- **THEN** the sign-in page displays a "Password reset successfully" confirmation message

#### Scenario: No confirmation without reset param
- **WHEN** a user navigates to `/sign-in` without `?reset=true`
- **THEN** no reset confirmation message is shown

---

### Requirement: Google OAuth entry point on sign-in page
The sign-in page SHALL display a "Continue with Google" button that navigates to `GET /api/auth/google` to begin the OAuth flow.

#### Scenario: Google button visible on sign-in page
- **WHEN** a user views the sign-in page
- **THEN** a "Continue with Google" button is visible and navigating to it initiates the Google OAuth flow

---

### Requirement: Google OAuth entry point on sign-up page
The sign-up page SHALL display a "Continue with Google" button that navigates to `GET /api/auth/google` to begin the OAuth flow. Users who sign up via Google bypass email verification.

#### Scenario: Google button visible on sign-up page
- **WHEN** a user views the sign-up page
- **THEN** a "Continue with Google" button is visible and navigating to it initiates the Google OAuth flow

---

### Requirement: Account profile endpoint returns auth method flags
The system SHALL expose `GET /api/auth/account/profile` which returns the authenticated user's profile data including flags indicating which authentication methods are active.

#### Scenario: Profile endpoint returns full profile
- **WHEN** an authenticated user calls `GET /api/auth/account/profile`
- **THEN** the response includes `name`, `email`, `has_password` (bool), `google_linked` (bool), and `mfa_enabled` (bool)

#### Scenario: Unauthenticated request is rejected
- **WHEN** a request is made to `GET /api/auth/account/profile` without a valid session cookie
- **THEN** the system returns 401
