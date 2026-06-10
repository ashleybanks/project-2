## ADDED Requirements

### Requirement: Account profile endpoint returns auth method flags
The system SHALL expose `GET /api/auth/account/profile` which returns the authenticated user's profile data including flags indicating which authentication methods are active.

#### Scenario: Profile endpoint returns full profile
- **WHEN** an authenticated user calls `GET /api/auth/account/profile`
- **THEN** the response includes `name`, `email`, `has_password` (bool), `google_linked` (bool), and `mfa_enabled` (bool)

#### Scenario: Unauthenticated request is rejected
- **WHEN** a request is made to `GET /api/auth/account/profile` without a valid session cookie
- **THEN** the system returns 401
