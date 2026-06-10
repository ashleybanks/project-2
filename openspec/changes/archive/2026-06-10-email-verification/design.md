## Context

Auth is implemented as a pure Rust layer (argon2 + sqlx + custom sessions table, per ADR-011). Sign-up currently creates a session immediately, giving unverified users full app access. This change adds email verification as a hard gate: no session is created until the user clicks a verification link. Resend is the chosen transactional email provider; the API key and sender address are environment-variable-driven so the production domain swap is a config change only.

## Goals / Non-Goals

**Goals:**
- Block app access until email is verified (hard gate)
- Send verification email via Resend on sign-up
- Allow users to request a fresh verification email
- Surface a specific error on sign-in for unverified accounts so the frontend can offer a resend link
- Frontend states for "check your email", verification success/failure, and resend

**Non-Goals:**
- Rate limiting on the resend endpoint
- Email change / re-verification flow
- OAuth sign-in
- Production domain configuration (env var swap)

## Decisions

### 1. Token storage: dedicated table

Verification tokens live in a new `email_verification_tokens` table, not on the `users` row.

| Approach | Notes |
|---|---|
| Column on `users` (`verification_token`, `verification_expires_at`) | Simple, but clutters the users table and makes it awkward to issue multiple tokens or reason about token lifecycle separately |
| Dedicated `email_verification_tokens` table | Clean separation; consistent with how sessions are modelled; easy to DELETE all tokens for a user on resend or on verification |

Decision: dedicated table. Same pattern as `sessions`. On resend, delete all existing tokens for the user and insert a new one — no need for a "latest token" query.

```sql
CREATE TABLE email_verification_tokens (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token      TEXT        NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Users table gains:
```sql
ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT false;
```

### 2. Token format: same as sessions (32 random bytes, hex)

No reason to deviate from the existing session token approach. `rand::thread_rng().gen::<u8>()` × 32, hex-encoded to 64 chars. TTL: 24 hours.

### 3. Resend integration: reqwest, no new crate

Resend's HTTP API is simple enough that a dedicated crate adds no value here. `reqwest` is already in the stack. A thin `email.rs` module wraps the API call:

```
POST https://api.resend.com/emails
Authorization: Bearer <RESEND_API_KEY>
Content-Type: application/json
{ "from": FROM_EMAIL, "to": [...], "subject": "...", "html": "..." }
```

`RESEND_API_KEY` and `FROM_EMAIL` are read from env at startup and stored in `AppState`.

### 4. Verification endpoint: redirect, not JSON

`GET /api/auth/verify-email?token=` is navigated to directly from an email link. On success it creates a session, sets the session cookie, and redirects to `/?verified=true`. On failure (expired or unknown token) it redirects to `/verify-email/error`. JSON would require the frontend to poll or handle a redirect manually — unnecessary complexity for a browser navigation.

### 5. Resend endpoint: unauthenticated, takes email in body

`POST /api/auth/resend-verification` accepts `{ "email": "..." }`. No session exists for unverified users, so authentication via cookie is not available. The endpoint silently succeeds even for unknown emails (no user enumeration). On a valid unverified email: delete all existing tokens for that user, generate a new one, send the email.

### 6. Sign-in gate: specific 403 error code

After credential validation, if `email_verified = false`, return:
```json
{ "error": "EMAIL_NOT_VERIFIED", "message": "Please verify your email before signing in." }
```
HTTP 403 (not 401 — credentials are valid, access is denied for a different reason). The frontend uses `ERROR_CODE === "EMAIL_NOT_VERIFIED"` to show the resend link rather than a generic error message.

## Risks / Trade-offs

**[Risk] Resend API call fails during sign-up** → The user account is created but no verification email arrives. Mitigation: surface the error in the sign-up response so the user knows to use "resend verification". The account is not rolled back — the user can always request a resend.

**[Risk] Token leak via URL (referrer headers, server logs)** → Tokens appear in the query string of the verification link. Mitigation: 24h TTL limits exposure window. Tokens are single-use (deleted on verification). Acceptable for email verification at this stage; consider POST-based token exchange if compliance requires it later.

**[Trade-off] Silent success on resend for unknown emails** → Prevents user enumeration but means typo'd emails get no feedback. Acceptable — consistent with standard auth UX.

**[Trade-off] No rate limiting on resend endpoint** → Can be spammed. Acceptable at this stage; rate limiting is a follow-on.

## Migration Plan

1. Add migration: `email_verified` column to `users` (default `false`); create `email_verification_tokens` table
2. Existing users will have `email_verified = false` after migration — they cannot sign in until verified. **Decision needed before deploying to production with existing users**: either backfill `email_verified = true` for all current accounts, or treat this as a clean-start deployment. For Phase 1 (no real users yet), no backfill is needed.
3. Add `RESEND_API_KEY` and `FROM_EMAIL` to `.env` and `.env.example`
4. Deploy backend changes; deploy frontend changes

## Open Questions

- None blocking implementation. The backfill question for existing users is only relevant at production launch, not during Phase 1 development.
