## 1. Dependencies & Migration

- [x] 1.1 Add `totp-rs = { version = "5", features = ["gen_secret"] }` to `apps/api/Cargo.toml`. Acceptance: `cargo check` compiles with the new crate.

- [x] 1.2 Create migration `0011_create_mfa_tables.sql`: create `user_mfa` table `(user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, totp_secret TEXT NOT NULL, enabled BOOL NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`; create `mfa_recovery_codes` table `(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, code_hash TEXT NOT NULL, used_at TIMESTAMPTZ)`; create `mfa_pending_tokens` table `(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, token TEXT NOT NULL UNIQUE, expires_at TIMESTAMPTZ NOT NULL)`. Acceptance: `cargo sqlx migrate run` succeeds.

## 2. Backend — MFA Module

- [x] 2.1 Create `apps/api/src/auth/mfa.rs`. Add helper `generate_totp_secret() -> String` (20 random bytes, base32-encoded via `totp-rs`). Add helper `verify_totp(secret: &str, code: &str) -> bool` using `totp-rs` (SHA1, 30s step, ±1 step tolerance). Acceptance: helpers compile and `verify_totp` returns true for a code generated from the same secret.

- [x] 2.2 In `mfa.rs`, add helper `generate_recovery_codes() -> Vec<String>` producing 10 codes of 8 random uppercase alphanumeric chars each. Add helper `hash_recovery_code(code: &str) -> Result<String, AppError>` using argon2. Add helper `verify_recovery_code(code: &str, hash: &str) -> bool` using argon2 `PasswordVerifier`. Acceptance: helpers compile; a code verifies against its own hash.

- [x] 2.3 In `mfa.rs`, implement `setup` handler (`POST /api/auth/mfa/setup`, requires auth via `Extension<AuthUser>`): upsert `user_mfa` row with `enabled = false` and a fresh secret; return `{ secret, otpauth_uri }` where `otpauth_uri` is `otpauth://totp/{app_name}:{email}?secret={secret}&issuer={app_name}`. Use `"Project-2"` as the app/issuer name for now. Acceptance: endpoint returns a valid `otpauth://` URI for a logged-in user.

- [x] 2.4 In `mfa.rs`, implement `confirm` handler (`POST /api/auth/mfa/confirm`, requires auth): fetch `user_mfa` row where `enabled = false`; return 422 if not found. Verify TOTP code; return 422 if invalid. Set `enabled = true`; delete any existing recovery codes; generate 10 codes, hash and insert into `mfa_recovery_codes`; return `{ recovery_codes: ["...", ...] }`. Acceptance: after calling confirm with a valid code, `user_mfa.enabled = true` and 10 recovery code rows exist.

- [x] 2.5 In `mfa.rs`, implement `challenge` handler (`POST /api/auth/mfa/challenge`): deserialise `{ mfa_token, code }`. Look up and delete the `mfa_pending_tokens` row (delete regardless of outcome — single-use). Return 422 if expired or not found. Fetch user's MFA record. Try code as TOTP first; if 6 digits and TOTP valid → create session. Else try code against each unused recovery code hash; if match → mark `used_at = NOW()`, create session. If neither matches → return 422. On session creation: return session cookie + `{ user: { id, email, name } }`. Acceptance: full challenge flow works with both TOTP and recovery codes.

- [x] 2.6 In `mfa.rs`, implement `disable` handler (`POST /api/auth/mfa/disable`, requires auth): deserialise `{ code }`. Fetch `user_mfa` where `enabled = true`; return 422 if not found. Try code as TOTP; if valid → delete `user_mfa` and `mfa_recovery_codes`. Else try against recovery code hashes; if match → delete both tables' rows. If neither → return 422. Acceptance: after calling disable with a valid code, the user's MFA rows are gone.

## 3. Backend — Sign-in & Session Updates

- [x] 3.1 Update `apps/api/src/auth/handlers.rs` `sign_in` handler: after successful password verification and email check, query `user_mfa` for `enabled = true`. If found: generate 32-byte hex token, insert into `mfa_pending_tokens` with `expires_at = NOW() + 5 min`, return `Json({ "mfa_required": true, "mfa_token": token })` with HTTP 200 and NO session cookie. Existing non-MFA path unchanged. Acceptance: sign-in with an MFA-enabled account returns `{ mfa_required: true, mfa_token }` instead of a session cookie.

- [x] 3.2 Update `apps/api/src/auth/handlers.rs` `get_session` handler: join `user_mfa` in the session query (or do a separate lookup) to include `"mfaEnabled": bool` in the user object of the response. Acceptance: `GET /api/auth/get-session` response includes `mfaEnabled` field.

## 4. Backend — Router

- [x] 4.1 Add `pub mod mfa;` to `apps/api/src/auth/mod.rs`. Register routes under the auth router: `POST /mfa/setup` → `mfa::setup`, `POST /mfa/confirm` → `mfa::confirm`, `POST /mfa/challenge` → `mfa::challenge`, `POST /mfa/disable` → `mfa::disable`. The `/mfa/challenge` route is public (no auth middleware); `/mfa/setup`, `/mfa/confirm`, `/mfa/disable` require auth via `Extension<AuthUser>`. Acceptance: `cargo check` passes.

## 5. Frontend — Sign-in MFA Challenge Step

- [x] 5.1 Update `apps/web/src/lib/api.ts`: modify `signInWithEmail` to return `{ mfa_required: true, mfa_token: string } | { user: ... }` discriminated union (or throw normally for errors). Add `submitMfaChallenge(mfa_token: string, code: string): Promise<void>` that POSTs to `/api/auth/mfa/challenge` and throws on non-2xx. Acceptance: TypeScript compiles cleanly.

- [x] 5.2 Update `apps/web/src/pages/SignIn.tsx`: add state for `mfaPending: { token: string } | null`. After a successful sign-in response that contains `mfa_required: true`, set `mfaPending`. When `mfaPending` is set, render a TOTP challenge step: a single input (type="text", maxLength=8, inputMode="numeric" for 6-digit; relaxed for recovery codes), a "Use recovery code" toggle that hints the user to type their 8-char code, a submit button that calls `submitMfaChallenge`, and a "Back" link that clears `mfaPending`. On success: navigate to `/app/templates`. On error: show "Invalid code. Please try again." Acceptance: sign-in with MFA enabled shows the challenge step.

## 6. Frontend — MFA Settings Page

- [x] 6.1 Create `apps/web/src/lib/mfaApi.ts` with: `setupMfa(): Promise<{ secret: string, otpauth_uri: string }>`, `confirmMfa(code: string): Promise<{ recovery_codes: string[] }>`, `disableMfa(code: string): Promise<void>`. All require credentials. Acceptance: TypeScript compiles; functions call the correct endpoints.

- [x] 6.2 Create `apps/web/src/pages/MfaSettingsPage.tsx`. Read `mfaEnabled` from the session (`useSession()`). If not enabled: show "Two-factor authentication" heading with a "Set up authenticator" button. Clicking it calls `setupMfa()` and transitions to the setup step. Acceptance: page renders correctly for unenrolled users.

- [x] 6.3 In `MfaSettingsPage.tsx`, implement the setup step: display the QR code (use `react-qr-code` npm package — add it) rendered from `otpauth_uri`, the manual entry key (the `secret`), and a 6-digit code input. On submit call `confirmMfa(code)`. On success, transition to the recovery codes step. On error show "Invalid code." Acceptance: QR code renders from the `otpauth_uri`.

- [x] 6.4 In `MfaSettingsPage.tsx`, implement the recovery codes step: display all 10 codes in a readable grid, a "Copy all" button (joins with newlines), a "Download" button (saves as `recovery-codes.txt`), and a "Done — I've saved my codes" button that returns to the main settings view (now showing MFA as enabled). Acceptance: codes are displayed and copy/download work.

- [x] 6.5 In `MfaSettingsPage.tsx`, implement the disable flow: when `mfaEnabled` is true, show a "Disable two-factor authentication" section. Clicking "Disable" shows a confirmation input for the TOTP code and a confirm button that calls `disableMfa(code)`. On success: invalidate the session query so `mfaEnabled` refreshes to false. On error: show "Invalid code." Acceptance: disable flow works end-to-end.

- [x] 6.6 Add `/app/settings/mfa` route to `apps/web/src/App.tsx` (inside the protected `AppLayout` routes). Import `MfaSettingsPage`. Acceptance: navigating to `/app/settings/mfa` renders the page without a 404.

## 7. End-to-End Verification

- [x] 7.1 Test MFA enrollment: navigate to `/app/settings/mfa` → scan QR code → enter code → view and save recovery codes. Verify `user_mfa.enabled = true` and 10 `mfa_recovery_codes` rows exist. Acceptance: full enrollment flow completes.

- [x] 7.2 Test MFA sign-in with TOTP: sign out, sign in with email/password → MFA challenge step appears → enter TOTP code → land on `/app/templates`. Acceptance: session created, app accessible.

- [x] 7.3 Test MFA sign-in with recovery code: use one of the 10 recovery codes in the challenge step. Verify that code's `used_at` is set and it cannot be reused. Acceptance: recovery code sign-in works; code is consumed.

- [x] 7.4 Test MFA disable: navigate to `/app/settings/mfa` → disable with TOTP → verify `user_mfa` row deleted. Sign out and back in — no MFA challenge. Acceptance: disable flow works end-to-end.

- [x] 7.5 Test Google OAuth bypass: sign in via Google for an account with MFA enabled — no MFA challenge step shown, lands directly on `/app/templates`. Acceptance: Google OAuth is unaffected by MFA.
