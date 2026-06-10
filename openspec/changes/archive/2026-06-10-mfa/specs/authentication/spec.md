## MODIFIED Requirements

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
