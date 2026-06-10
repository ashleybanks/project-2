## Context

The auth layer (argon2 + sqlx + custom sessions) and Resend email infrastructure are already in place from the email verification change. Password reset follows the same token pattern: a short-lived opaque token stored in a dedicated table, delivered by email, consumed on use. The main new concern is session invalidation on reset — all existing sessions for the user must be deleted to ensure a compromised account is fully revoked.

## Goals / Non-Goals

**Goals:**
- Allow users to request a password reset via email
- Validate reset tokens server-side before presenting the reset form
- Hash and store the new password; invalidate all existing sessions
- Redirect to sign-in with a confirmation param after success
- Surface "Forgot password?" entry point on the sign-in page

**Non-Goals:**
- Rate limiting on the forgot-password endpoint
- Password strength enforcement beyond 8-character minimum
- New device sign-in notifications
- Account lockout after repeated failed attempts

## Decisions

### 1. Dedicated `password_reset_tokens` table

Separate table rather than reusing `email_verification_tokens`. The two token types have different TTLs (1h vs 24h) and different post-validation actions. Keeping them separate avoids a discriminator column and keeps each table's purpose unambiguous.

```sql
CREATE TABLE password_reset_tokens (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token      TEXT        NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Token format: 32 random bytes, hex-encoded (64 chars) — same as sessions and verification tokens. TTL: 1 hour.

### 2. Two-step reset: redirect then POST

The flow splits across two requests:

```
GET  /api/auth/reset-password?token=
  → validates token exists and is not expired
  → on success: 302 to {frontend_url}/reset-password?token=
  → on failure: 302 to {frontend_url}/reset-password/error

POST /api/auth/reset-password
  body: { token, password }
  → re-validates token (it has NOT been deleted yet)
  → hashes new password, updates users.password_hash
  → DELETE FROM sessions WHERE user_id = ...
  → DELETE FROM password_reset_tokens WHERE token = ...
  → 302 to {frontend_url}/sign-in?reset=true
```

The GET step validates early so the user sees the error page before typing a new password rather than after. The token is NOT consumed on the GET — only on the POST. This means a user who navigates back and resubmits the form gets a proper "token already used" error rather than a silent failure.

**Alternative considered:** Single POST endpoint (frontend holds the token, posts directly). Simpler but requires the frontend to receive the token from the email link URL, which means the email link must point to the frontend rather than the API. This is fine architecturally but adds a round-trip: frontend loads, extracts token from URL, posts to API. The two-step approach keeps the validation server-side and consistent with how verify-email works.

### 3. Session invalidation on reset

`DELETE FROM sessions WHERE user_id = $1` runs in the same handler as the password update, before the redirect. This ensures any sessions created by an attacker (who may have triggered the reset) are invalidated. The legitimate user is redirected to sign-in and establishes a fresh session.

### 4. No session created after reset

The user is redirected to `/sign-in?reset=true` rather than being automatically signed in. This matches the deliberate, explicit sign-in model established by the email verification hard gate. It also avoids the complexity of setting a cookie in the same response as a redirect to the frontend.

### 5. Silent 200 on forgot-password for unknown emails

`POST /api/auth/forgot-password` always returns `200 {}` regardless of whether the email is registered. Identical to the resend-verification pattern. Prevents user enumeration.

## Risks / Trade-offs

**[Risk] Token still valid between GET and POST** → If a user is slow to submit the new password form, the token expires mid-flow. Mitigation: the POST returns an error and the frontend redirects to `/reset-password/error` with a link back to `/forgot-password`. Acceptable UX for a 1h window.

**[Risk] Attacker triggers reset to lock user out of sessions** → An attacker who knows a user's email can trigger a reset, invalidating the user's sessions. Mitigation: the legitimate user still has their password and can sign in again. The reset email gives them control. This is standard behaviour for password reset flows.

**[Trade-off] No rate limiting** → The forgot-password endpoint can be spammed. Acceptable at this stage; rate limiting is a follow-on.

## Migration Plan

1. Add migration: create `password_reset_tokens` table
2. Deploy backend changes; deploy frontend changes — no existing data is affected

## Open Questions

None blocking implementation.
