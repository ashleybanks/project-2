## ADDED Requirements

### Requirement: MFA enrollment — setup
The system SHALL provide `POST /api/auth/mfa/setup` (requires auth) to begin TOTP enrollment. The endpoint SHALL generate a random TOTP secret, store it in `user_mfa` with `enabled = false`, and return the base32 secret and `otpauth://` URI. If a pending (unenabled) setup already exists, it SHALL be overwritten.

#### Scenario: Setup returns secret and URI
- **WHEN** an authenticated user calls `POST /api/auth/mfa/setup`
- **THEN** a `user_mfa` row is created with `enabled = false`, and the response contains `{ secret, otpauth_uri }`

#### Scenario: Re-setup overwrites pending enrollment
- **WHEN** an authenticated user calls `POST /api/auth/mfa/setup` when a pending (unenabled) setup already exists
- **THEN** the existing secret is replaced and a fresh `{ secret, otpauth_uri }` is returned

---

### Requirement: MFA enrollment — confirm
The system SHALL provide `POST /api/auth/mfa/confirm` (requires auth) to complete enrollment. The endpoint SHALL accept a 6-digit TOTP code, verify it against the pending secret, flip `enabled = true`, generate 10 single-use recovery codes, hash and store them in `mfa_recovery_codes`, and return the 10 plaintext codes (shown once only).

#### Scenario: Valid code enables MFA and issues recovery codes
- **WHEN** an authenticated user calls `POST /api/auth/mfa/confirm` with a valid TOTP code
- **THEN** `user_mfa.enabled` is set to `true`, 10 hashed recovery codes are stored, and the 10 plaintext codes are returned in the response

#### Scenario: Invalid code rejected
- **WHEN** an authenticated user calls `POST /api/auth/mfa/confirm` with an incorrect TOTP code
- **THEN** `user_mfa.enabled` remains `false` and the endpoint returns HTTP 422

#### Scenario: Confirm without setup rejected
- **WHEN** an authenticated user calls `POST /api/auth/mfa/confirm` with no pending setup
- **THEN** the endpoint returns HTTP 422

---

### Requirement: MFA sign-in challenge
The system SHALL provide `POST /api/auth/mfa/challenge` to complete sign-in when MFA is required. The endpoint SHALL accept `{ mfa_token, code }`, validate the token (not expired, exists), then validate the code as either a TOTP or a recovery code. On success: delete the pending token, create a session, set the session cookie. On failure: delete the pending token (single-use regardless of outcome) and return HTTP 422.

#### Scenario: Valid TOTP code completes sign-in
- **WHEN** `POST /api/auth/mfa/challenge` is called with a valid `mfa_token` and correct 6-digit TOTP code
- **THEN** the pending token is deleted, a session is created, the session cookie is set, and the user object is returned

#### Scenario: Valid recovery code completes sign-in
- **WHEN** `POST /api/auth/mfa/challenge` is called with a valid `mfa_token` and a valid unused recovery code
- **THEN** the pending token is deleted, the recovery code's `used_at` is set, a session is created, and the session cookie is set

#### Scenario: Invalid code rejected
- **WHEN** `POST /api/auth/mfa/challenge` is called with a valid `mfa_token` but an incorrect code
- **THEN** the pending token is deleted and the endpoint returns HTTP 422

#### Scenario: Expired or unknown token rejected
- **WHEN** `POST /api/auth/mfa/challenge` is called with an expired or non-existent `mfa_token`
- **THEN** the endpoint returns HTTP 422 with no session created

---

### Requirement: MFA disable
The system SHALL provide `POST /api/auth/mfa/disable` (requires auth) to remove TOTP MFA. The endpoint SHALL accept `{ code }` (TOTP or recovery code), verify it, then delete the `user_mfa` row and all `mfa_recovery_codes` for the user.

#### Scenario: Disable with valid TOTP
- **WHEN** an authenticated user calls `POST /api/auth/mfa/disable` with a valid TOTP code
- **THEN** the `user_mfa` row and all recovery codes are deleted

#### Scenario: Disable with valid recovery code
- **WHEN** an authenticated user calls `POST /api/auth/mfa/disable` with a valid unused recovery code
- **THEN** the `user_mfa` row and all recovery codes are deleted

#### Scenario: Disable with invalid code rejected
- **WHEN** an authenticated user calls `POST /api/auth/mfa/disable` with an incorrect code
- **THEN** MFA remains enabled and the endpoint returns HTTP 422

---

### Requirement: MFA status in session
The `GET /api/auth/get-session` endpoint SHALL include `mfa_enabled: bool` in the user object so clients can determine MFA enrollment state without a separate request.

#### Scenario: Session reflects MFA state
- **WHEN** `GET /api/auth/get-session` is called by an authenticated user
- **THEN** the user object includes `mfa_enabled: true` if MFA is enrolled and enabled, `false` otherwise

---

### Requirement: MFA settings page
The React frontend SHALL provide a protected route at `/app/settings/mfa` for managing TOTP enrollment.

#### Scenario: Unenrolled user sees setup flow
- **WHEN** a user with no MFA navigates to `/app/settings/mfa`
- **THEN** they see a "Set up authenticator" entry point; clicking it calls `POST /api/auth/mfa/setup`, displays a QR code and manual key, and prompts for a 6-digit confirmation code

#### Scenario: QR code confirmed — recovery codes displayed
- **WHEN** the user submits a valid TOTP code on the setup confirmation step
- **THEN** `POST /api/auth/mfa/confirm` is called, and the 10 recovery codes are displayed with copy and download options; the user must acknowledge before continuing

#### Scenario: Enrolled user sees disable option
- **WHEN** a user with MFA enabled navigates to `/app/settings/mfa`
- **THEN** they see a "Disable MFA" option that requires entering a TOTP code before calling `POST /api/auth/mfa/disable`
