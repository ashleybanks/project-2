## ADDED Requirements

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
