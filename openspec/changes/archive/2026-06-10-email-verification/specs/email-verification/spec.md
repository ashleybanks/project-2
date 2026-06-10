## ADDED Requirements

### Requirement: Verification email on sign-up
The system SHALL generate a time-limited verification token (24h TTL) on successful sign-up, store it in the `email_verification_tokens` table, and send a verification email to the registered address via Resend. The email SHALL contain a link to `GET /api/auth/verify-email?token=<token>`.

#### Scenario: Verification email sent on sign-up
- **WHEN** a user successfully registers a new account
- **THEN** a verification token is created with a 24h expiry, an email is sent to the registered address containing the verification link, and no session cookie is set

#### Scenario: Resend API failure on sign-up
- **WHEN** the Resend API call fails during sign-up
- **THEN** the account is created, the sign-up response indicates the email could not be sent, and the user can request a resend via `POST /api/auth/resend-verification`

---

### Requirement: Email verification endpoint
The system SHALL provide `GET /api/auth/verify-email?token=` to verify a user's email address. On success, the user's account SHALL be marked verified, a session SHALL be created, and the browser SHALL be redirected to the application. On failure, the browser SHALL be redirected to an error page.

#### Scenario: Valid token verifies account
- **WHEN** a user navigates to `/api/auth/verify-email?token=<valid-token>`
- **THEN** the user's `email_verified` flag is set to `true`, the token is deleted, a session is created, a session cookie is set, and the browser is redirected to `/?verified=true`

#### Scenario: Expired token rejected
- **WHEN** a user navigates to `/api/auth/verify-email?token=<expired-token>`
- **THEN** the token is deleted, no session is created, and the browser is redirected to `/verify-email/error`

#### Scenario: Unknown token rejected
- **WHEN** a user navigates to `/api/auth/verify-email?token=<unknown-token>`
- **THEN** no session is created and the browser is redirected to `/verify-email/error`

---

### Requirement: Resend verification email
The system SHALL provide `POST /api/auth/resend-verification` to issue a new verification token and resend the verification email. All prior verification tokens for the user SHALL be invalidated. The endpoint SHALL return a success response regardless of whether the email address is registered, to prevent user enumeration.

#### Scenario: Resend for valid unverified account
- **WHEN** `POST /api/auth/resend-verification` is called with the email address of an unverified account
- **THEN** all prior tokens for that user are deleted, a new token is generated with a fresh 24h TTL, and a new verification email is sent

#### Scenario: Resend for unknown or already-verified email
- **WHEN** `POST /api/auth/resend-verification` is called with an email address that is not registered or is already verified
- **THEN** the endpoint returns HTTP 200 with no indication of whether the email exists or is verified

---

### Requirement: Frontend verification states
The React frontend SHALL handle verification-related states across the sign-up, sign-in, and verify-email flows.

#### Scenario: Sign-up shows "check your email" state
- **WHEN** a user successfully submits the sign-up form
- **THEN** the frontend displays a "check your email" message and does not redirect to the application

#### Scenario: Verify-email route handles success
- **WHEN** a user is redirected to `/?verified=true` after clicking the verification link
- **THEN** the frontend shows a brief confirmation that the email has been verified

#### Scenario: Verify-email route handles error
- **WHEN** a user navigates to `/verify-email/error`
- **THEN** the frontend displays an error message and offers a form to request a new verification email

#### Scenario: Sign-in offers resend link for unverified accounts
- **WHEN** a user attempts to sign in and receives an `EMAIL_NOT_VERIFIED` error
- **THEN** the sign-in form displays a message indicating verification is required and shows a link or button to resend the verification email
