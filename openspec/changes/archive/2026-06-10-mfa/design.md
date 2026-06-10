## Context

The auth system uses pure Rust with argon2 + sqlx + PostgreSQL sessions. Email/password sign-in, email verification, password reset, and Google OAuth are all implemented. This change adds opt-in TOTP MFA as a second factor for email/password sign-in. Google OAuth sign-in is exempt — Google is treated as a trusted second factor in its own right.

## Goals / Non-Goals

**Goals:**
- Users can enroll TOTP via an authenticator app and be challenged on every email/password sign-in
- Recovery codes allow account access if the authenticator is lost
- MFA can be disabled by a verified user
- No new external services — TOTP is computed locally via the `totp-rs` crate

**Non-Goals:**
- SMS / email OTP
- Mandatory MFA enforcement for all users
- MFA for Google OAuth sign-in
- Rate limiting on challenge attempts (follow-on)

## Decisions

### Two-step sign-in via `mfa_pending_tokens`
When a user with MFA enabled passes the password check, the sign-in handler does **not** create a session. Instead it inserts a short-lived row into `mfa_pending_tokens` (user_id, random 32-byte hex token, 5-min TTL) and returns `{ mfa_required: true, mfa_token }` with HTTP 200. The frontend holds this token in React state (not stored — it expires) and submits it with the TOTP code to `POST /api/auth/mfa/challenge`.

**Alternative considered:** Use a signed JWT to avoid the DB table. Rejected — we have no JWT infrastructure and the DB table keeps the pattern consistent with verification and reset tokens.

### TOTP via `totp-rs`
RFC 6238, SHA-1, 30-second window, ±1 step tolerance (covers ~60 seconds of clock drift). The secret is a random 20-byte value, base32-encoded for display and storage. The `otpauth://` URI enables QR code generation in the frontend via a library or a QR code service.

**Alternative considered:** Implement TOTP manually using hmac + sha1 crates. Rejected — `totp-rs` is a well-tested implementation with a clean API.

### QR code rendered client-side
The setup endpoint returns the `otpauth://` URI and base32 secret. The frontend renders the QR code using the `qrcode` npm package (or `react-qr-code`). No server-side image generation needed.

### Recovery codes: 8 alphanumeric chars, argon2-hashed
10 codes generated on MFA confirm. Each code is `8` random uppercase alphanumeric characters (e.g. `A3BX9KQP`), shown to the user once and never again. Stored as argon2 hashes in `mfa_recovery_codes`. On use: `used_at` is set; used codes are rejected. All codes are deleted and regenerated if MFA is re-enrolled.

**Why argon2 for recovery codes?** Recovery codes are high-value secrets. If the DB is compromised, hashed codes prevent immediate account takeover (unlike plaintext). argon2 is already in the stack.

### Enrollment is two-step: setup then confirm
`POST /api/auth/mfa/setup` generates the secret and stores it in `user_mfa` with `enabled = false`. `POST /api/auth/mfa/confirm` verifies the first TOTP code and flips `enabled = true`, issuing recovery codes. This prevents a user from accidentally locking themselves out by enabling MFA with a misconfigured authenticator.

### Disable requires TOTP or recovery code
`POST /api/auth/mfa/disable` accepts `{ code }`. The handler tries the code as a TOTP first; if it doesn't match (wrong length or invalid), tries it against each unhashed recovery code. Requires an active session. On success: deletes `user_mfa` row and all `mfa_recovery_codes`.

### MFA status in session response
`GET /api/auth/get-session` is extended to include `"mfaEnabled": bool` in the user object so the frontend can show/hide the disable UI without a separate request.

## Risks / Trade-offs

- **Pending token replay**: a `mfa_pending_token` is single-use — consumed (deleted) the moment the challenge is attempted, whether or not the TOTP is valid. This prevents replay but means a wrong code locks the user out of that token; they must sign in again. → Acceptable; the sign-in page handles this gracefully.
- **Lost authenticator with no recovery codes**: user is locked out. → Recovery codes are mandatory to display after enrollment; the UI should make this very clear. Admin-level account recovery is a B2B concern.
- **Clock drift beyond ±1 step**: valid codes rejected. → ±1 step covers 90 seconds of drift, which handles nearly all real-world cases. Users with extreme drift can fix their device clock.
- **`totp-rs` crate dependency**: small, well-maintained, no transitive complexity. → Acceptable.

## Migration Plan

1. Run migration: create `user_mfa`, `mfa_recovery_codes`, `mfa_pending_tokens` tables
2. Add `totp-rs` to Cargo.toml
3. Deploy backend with new endpoints and modified sign-in handler
4. Deploy frontend with MFA challenge step and settings page
5. No data migration — existing users are unaffected (MFA defaults to disabled)

**Rollback:** Remove new endpoints and revert sign-in handler. The three new tables can remain empty.
