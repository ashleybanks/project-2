## ADDED Requirements

### Requirement: User can view their account profile
The system SHALL provide an account settings page at `/app/settings/account` that displays the authenticated user's name and email address, and indicates which authentication methods are active.

#### Scenario: Profile page loads with user data
- **WHEN** an authenticated user navigates to `/app/settings/account`
- **THEN** the page displays the user's current display name, their email address (read-only), whether Google is connected, and the current MFA status

#### Scenario: Unauthenticated access is blocked
- **WHEN** an unauthenticated user navigates to `/app/settings/account`
- **THEN** the system redirects to `/sign-in` with a redirect parameter

### Requirement: User can update their display name
The system SHALL allow an authenticated user to update their display name. The name field SHALL accept any non-empty string up to 100 characters.

#### Scenario: Successful name update
- **WHEN** a user submits a non-empty name via the profile form
- **THEN** the system updates `users.name` and returns the updated name in the response

#### Scenario: Empty name is rejected
- **WHEN** a user submits an empty string as their name
- **THEN** the system returns a 422 error and the name is not updated

### Requirement: Password-bearing users can change their password
The system SHALL allow users who have a password (i.e. are not Google-only) to change their password by providing their current password and a new password. Google-only users SHALL NOT see the password change form.

#### Scenario: Successful password change
- **WHEN** a password-bearing user submits a correct current password and a valid new password
- **THEN** the system verifies the current password, hashes the new password, and updates `users.password_hash`

#### Scenario: Wrong current password is rejected
- **WHEN** a user submits an incorrect current password
- **THEN** the system returns a 422 with error code `INVALID_CURRENT_PASSWORD` and the password is not changed

#### Scenario: Google-only user sees no password section
- **WHEN** a user whose account was created via Google OAuth (no password hash) views the account settings page
- **THEN** the password change section is hidden

### Requirement: MFA status is surfaced on the account page
The system SHALL display the user's current MFA status (enabled or disabled) on the account settings page with a link to the MFA settings page.

#### Scenario: MFA enabled status shown
- **WHEN** a user with MFA enabled views the account settings page
- **THEN** the MFA card shows "Enabled" and a link to `/app/settings/mfa`

#### Scenario: MFA disabled status shown
- **WHEN** a user without MFA views the account settings page
- **THEN** the MFA card shows "Not enabled" and a link to `/app/settings/mfa` to set it up

### Requirement: Connected accounts are visible
The system SHALL display which external authentication providers are linked to the user's account. No linking or unlinking action is provided in this version.

#### Scenario: Google linked account shown
- **WHEN** a user whose account has a Google OAuth connection views the account settings page
- **THEN** the connected accounts section shows Google as "Connected"

#### Scenario: No Google connection shown
- **WHEN** a user who has not linked Google views the account settings page
- **THEN** the connected accounts section shows Google as "Not connected"

### Requirement: Account settings accessible from navigation
The system SHALL provide a link to the account settings page in the TopNav user dropdown menu.

#### Scenario: Dropdown contains account settings link
- **WHEN** an authenticated user opens the TopNav user dropdown
- **THEN** an "Account settings" item is present and navigates to `/app/settings/account`
