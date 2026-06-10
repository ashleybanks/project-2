## ADDED Requirements

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
