## MODIFIED Requirements

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
The system SHALL allow a registered, verified user to sign in with their email and password. On success, a server-side session SHALL be created and an HTTP-only session cookie SHALL be set. Unverified users SHALL be rejected with a distinct error code.

#### Scenario: Successful sign-in
- **WHEN** a registered, verified user submits valid credentials
- **THEN** a session is created in PostgreSQL, an HTTP-only cookie is set, and the user is redirected to the application

#### Scenario: Invalid credentials rejected
- **WHEN** a user submits an unrecognised email or incorrect password
- **THEN** the system SHALL return a generic "invalid credentials" error (no indication of which field is wrong)

#### Scenario: Unverified account rejected
- **WHEN** a registered but unverified user submits valid credentials
- **THEN** the system SHALL return HTTP 403 with error code `EMAIL_NOT_VERIFIED` and no session is created

#### Scenario: Session persists across page reload
- **WHEN** an authenticated user reloads the browser
- **THEN** the session cookie is sent automatically and the user remains authenticated without re-entering credentials
