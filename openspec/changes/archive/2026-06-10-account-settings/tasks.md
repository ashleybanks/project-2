## 1. Backend — Account module

- [x] 1.1 Create `apps/api/src/auth/account.rs` with `GET /api/auth/account/profile` handler — queries `users`, `oauth_accounts`, and `user_mfa` to return `{ name, email, has_password, google_linked, mfa_enabled }`. Requires auth via `Extension<AuthUser>`. AC: endpoint returns 200 with all five fields for an authenticated user; returns 401 for unauthenticated requests.
- [x] 1.2 Add `PATCH /api/auth/account/profile` handler — accepts `{ name: String }`, validates non-empty and ≤100 chars, updates `users.name` and `updated_at`, returns `{ name }`. AC: name is updated in DB and returned; empty name returns 422.
- [x] 1.3 Add `POST /api/auth/account/change-password` handler — accepts `{ current_password, new_password }`, rejects if `password_hash` is empty (Google-only), verifies current password with argon2, hashes and stores new password. AC: correct current password updates hash; wrong current password returns 422 with `INVALID_CURRENT_PASSWORD`; Google-only user returns 422 with `NO_PASSWORD`.
- [x] 1.4 Register `account.rs` module in `apps/api/src/auth/mod.rs` and mount the three routes under `/api/auth/account/` with `require_auth` middleware. AC: all three routes are reachable and return 401 without a valid session cookie.

## 2. Frontend — API client

- [x] 2.1 Create `apps/web/src/lib/accountApi.ts` with typed functions: `getAccountProfile()`, `updateProfile(name: string)`, `changePassword(currentPassword: string, newPassword: string)`. AC: functions compile; errors from API are thrown as typed errors with `.code` for known error codes.

## 3. Frontend — Account settings page

- [x] 3.1 Create `apps/web/src/pages/AccountSettingsPage.tsx` — on mount calls `getAccountProfile()` and stores result in state. Page renders three card sections: Profile, Security, Connected Accounts. AC: page renders without error and populates fields from API response.
- [x] 3.2 Implement Profile section — name input pre-filled from profile, save button calls `updateProfile()`, shows success feedback, updates displayed name on success. Email shown as read-only text. AC: name change is persisted after save; empty name shows inline error without calling API.
- [x] 3.3 Implement Security section — conditionally renders password change form only if `has_password` is true. Form has current password and new password fields (both with show/hide toggles), submit calls `changePassword()`. Shows inline error on `INVALID_CURRENT_PASSWORD`. MFA status card always shown: badge (Enabled/Not enabled) and a link to `/app/settings/mfa`. AC: Google-only user sees MFA card but no password form; password change succeeds silently or shows error message.
- [x] 3.4 Implement Connected Accounts section — renders Google card with "Connected" or "Not connected" badge based on `google_linked`. AC: badge reflects actual `google_linked` value from profile API.
- [x] 3.5 Register route in `apps/web/src/App.tsx` — add `<Route path="settings/account" element={<AccountSettingsPage />} />` inside the protected nested routes. AC: `/app/settings/account` renders the page when authenticated.

## 4. Frontend — Navigation

- [x] 4.1 Add "Account settings" link to the TopNav dropdown in `apps/web/src/components/TopNav.tsx` — insert above "Brand settings", navigates to `/app/settings/account`. AC: dropdown shows "Account settings" item and clicking it navigates correctly.
