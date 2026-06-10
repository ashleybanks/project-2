## Why

Users have no way to manage their own account details — there is currently no profile editing, no password change flow, and no way to see which authentication methods are connected to their account. This is the final piece of the initial auth feature set.

## What Changes

- New `/app/settings/account` page with three sections: profile editing, security (password change + MFA status), and connected accounts (Google)
- New backend account management endpoints: `GET /api/auth/account/profile`, `PATCH /api/auth/account/profile`, `POST /api/auth/account/change-password`
- TopNav user dropdown gains an "Account settings" link
- MFA status surfaced on the account page with a link to the existing MFA settings page

## Capabilities

### New Capabilities

- `account-settings`: Account profile viewing/editing, password management, and connected account visibility for authenticated users

### Modified Capabilities

- `authentication`: Sign-in session now exposes `hasPassword` and `googleLinked` flags in the profile endpoint (not in the session token itself — new dedicated profile endpoint)

## Impact

- `apps/api/src/auth/` — new `account.rs` module with three handlers; added to auth router
- `apps/web/src/pages/AccountSettingsPage.tsx` — new page
- `apps/web/src/components/TopNav.tsx` — dropdown link added
- `apps/web/src/App.tsx` — new route registered
- No new migrations — uses existing `users` and `oauth_accounts` tables
- No new dependencies

## Non-goals

- Email address change (requires re-verification flow — deferred)
- Avatar / profile photo upload (deferred)
- Session management / log out of other devices (backlog)
- Delete account (deferred)
- Google account linking/unlinking (read-only display only)

## Phase

Phase 1 — foundational auth, completing the initial auth feature set.
