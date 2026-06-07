## ADDED Requirements

### Requirement: User registration
The system SHALL allow a new user to create an account using an email address and password. The password SHALL be hashed server-side before storage. Duplicate email addresses SHALL be rejected with a clear error.

#### Scenario: Successful registration
- **WHEN** a user submits a valid email and password via the sign-up form
- **THEN** an account is created, a session is established, and the user is redirected to the application

#### Scenario: Duplicate email rejected
- **WHEN** a user attempts to register with an email address already in use
- **THEN** the system SHALL return an error indicating the email is already registered, without revealing whether a password exists

#### Scenario: Invalid input rejected
- **WHEN** a user submits a registration form with a missing email or password below minimum length
- **THEN** the system SHALL return field-level validation errors before any server request is made

---

### Requirement: User sign-in
The system SHALL allow a registered user to sign in with their email and password. On success, a server-side session SHALL be created and an HTTP-only session cookie SHALL be set.

#### Scenario: Successful sign-in
- **WHEN** a registered user submits valid credentials
- **THEN** a session is created in PostgreSQL, an HTTP-only cookie is set, and the user is redirected to the application

#### Scenario: Invalid credentials rejected
- **WHEN** a user submits an unrecognised email or incorrect password
- **THEN** the system SHALL return a generic "invalid credentials" error (no indication of which field is wrong)

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
