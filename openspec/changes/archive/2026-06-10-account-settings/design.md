## Context

Auth currently has sign-up, sign-in (email + Google OAuth), email verification, password reset, and MFA. There is no surface for users to manage their account post-sign-up — no name editing, no password change, no visibility into linked auth methods.

The `users` table already has `name` and `updated_at` columns. The `oauth_accounts` table records Google OAuth links. No schema changes are required.

## Goals / Non-Goals

**Goals:**
- Allow users to update their display name
- Allow password-bearing users to change their password
- Show MFA status and surface a link to the MFA settings page
- Show which external auth methods (Google) are connected — read-only
- Add "Account settings" entry to the TopNav dropdown

**Non-Goals:**
- Email address change (requires re-verification — deferred)
- Avatar/photo upload
- Google account linking or unlinking
- Session management (log out other devices — backlog)
- Delete account (deferred)

## Decisions

### New module: `apps/api/src/auth/account.rs`

The three new endpoints are thin CRUD against existing tables, following the same pattern as other auth handlers. A new `account.rs` module keeps concerns separated. All routes mount under `/api/auth/account/` and go through the existing `require_auth` middleware.

**Alternative considered:** Adding handlers directly to `handlers.rs`. Rejected — the file is already large and account management is a distinct concern.

### Single profile endpoint returns all flags

`GET /api/auth/account/profile` returns `{ name, email, has_password, google_linked, mfa_enabled }` in one request, rather than making the frontend call multiple endpoints. The frontend uses this to decide what to render (e.g. hide password section for Google-only users).

`has_password` is derived by checking whether `users.password_hash` is non-empty (Google OAuth sign-ups receive an empty string sentinel — see existing `handlers.rs`). `google_linked` queries `oauth_accounts WHERE user_id = $1 AND provider = 'google'`. `mfa_enabled` queries `user_mfa WHERE user_id = $1 AND enabled = true`.

### Password change: verify then update atomically

`POST /api/auth/account/change-password` accepts `{ current_password, new_password }`. It:
1. Fetches `password_hash` from `users`
2. Returns 422 if hash is empty (Google-only user, no password to change)
3. Verifies `current_password` against the stored hash using argon2
4. Returns 422 with `"INVALID_CURRENT_PASSWORD"` error code if verification fails
5. Hashes `new_password` and updates `users.password_hash` + `updated_at`

No session invalidation on password change in this pass — that's part of the "log out other devices" backlog item.

### Frontend: single page, no sub-navigation

Given the small surface area, one page (`AccountSettingsPage`) with sequential card sections is sufficient. No sidebar or tab navigation needed at this scope. The MFA card links out to the existing `/app/settings/mfa` page rather than embedding MFA setup inline.

## Risks / Trade-offs

- **No session invalidation on password change** → A stolen session remains valid after the user changes their password. Acceptable for Phase 1; the log-out-devices backlog item addresses this.
- **`has_password` derived from empty-string sentinel** → If the sentinel ever changes, the flag breaks silently. Mitigation: the check is in one place (`account.rs`) and the sentinel convention is consistent with `handlers.rs`.

## Migration Plan

No migrations required. All new endpoints use existing tables.

Deploy: add `account.rs` module, register routes in `auth/mod.rs`, add frontend page and route. Fully backwards-compatible — no existing behaviour changes.

## Open Questions

None. Scope is fully defined.
