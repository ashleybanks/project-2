## Why

Email and password alone (or even Google OAuth) leaves accounts vulnerable to credential compromise. TOTP-based MFA adds a second factor that an attacker cannot steal from a password database, giving security-conscious users meaningful account protection before real user acquisition begins.

## What Changes

- New `user_mfa` table stores per-user TOTP secret and enrollment state
- New `mfa_recovery_codes` table stores 10 hashed single-use recovery codes per enrolled user
- New `mfa_pending_tokens` table stores short-lived (5 min) tokens issued after a successful password check when MFA is enrolled — the bridge between the password step and the TOTP step
- `POST /api/auth/sign-in/email` updated: if the user has MFA enabled, returns `{ mfa_required: true, mfa_token }` with no session cookie instead of completing sign-in
- New endpoint `POST /api/auth/mfa/challenge` — accepts `{ mfa_token, code }` (6-digit TOTP or 8-char recovery code); creates session on success
- New endpoint `POST /api/auth/mfa/setup` — generates and returns a TOTP secret + `otpauth://` URI; requires auth; does not enable MFA yet
- New endpoint `POST /api/auth/mfa/confirm` — verifies a TOTP code against the pending secret, enables MFA, generates and returns 10 recovery codes (plaintext, once only)
- New endpoint `POST /api/auth/mfa/disable` — disables MFA and deletes recovery codes; requires a valid TOTP code or recovery code as confirmation
- Sign-in page updated: detects `mfa_required` in sign-in response, transitions to a TOTP challenge step with a 6-digit input and "Use recovery code" toggle
- New protected route `/app/settings/mfa`: step-by-step enrollment flow (QR code → confirm code → save recovery codes), and a disable option for enrolled users
- Google OAuth sign-in bypasses MFA (Google's own auth is treated as sufficient second factor)
- `totp-rs` crate added to backend dependencies

## Capabilities

### New Capabilities

- `mfa`: End-to-end TOTP MFA covering enrollment, sign-in challenge, recovery codes, and disable flow

### Modified Capabilities

- `authentication`: Sign-in flow gains an MFA challenge step when MFA is enrolled

## Impact

- **Backend**: 3 new DB tables; 4 new endpoints; sign-in handler modified; `totp-rs` crate added
- **Frontend**: Sign-in page gains MFA challenge step; new `/app/settings/mfa` route added to protected app
- **Dependencies**: `totp-rs` crate (TOTP generation/verification, no external service required)

## Non-goals

- SMS or email OTP — TOTP only
- Enforcing MFA for all users (opt-in per user)
- MFA for Google OAuth sign-in (Google handles second factor)
- Rate limiting on MFA challenge attempts (follow-on)
- Admin-level MFA enforcement policies (B2B phase)

## Phase

Phase 1 — security hardening before real user acquisition.
