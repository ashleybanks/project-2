# Better Auth Rust Ecosystem Evaluation

**Date:** 2026-06-07
**Spike task:** 2.1

---

## The `better-auth` Rust crate (v0.10.0)

| Property | Finding |
|---|---|
| Version | 0.10.0 (released April 2026) |
| Downloads | ~320/month — low adoption |
| Maintenance | Active (13 releases), but recent breaking changes |
| Axum support | Yes, behind `axum` feature flag |
| TS SDK compatible? | **Unconfirmed** — structs noted as "matches OpenAPI schema" but no explicit statement |
| Stability | Not stable — breaking changes between versions |

### Verdict: Not recommended for this spike

The crate is a **Rust-native reimplementation** of Better Auth concepts, not a
protocol-compatible backend for the TypeScript SDK. TS SDK compatibility would
need to be verified by running both and comparing HTTP request/response shapes —
which would take longer than writing a thin middleware from scratch.

At 320 downloads/month with recent breaking changes, adopting it introduces
dependency risk for a core auth layer with minimal ecosystem payoff.

---

## Options Evaluated

### Option A: Pure Rust auth (recommended)
Write a thin, self-contained auth layer in Axum:
- `argon2` for password hashing
- Custom `sessions` table in PostgreSQL
- Axum middleware that validates the session cookie against the sessions table
- No external auth crate dependency

**Pros:** Full control, no dependency risk, no Node.js process, ~200 lines of Rust
**Cons:** More code to write; no "batteries included" (OAuth later requires more work)

### Option B: Better Auth JS sidecar (Hono) + Axum session validation
Run a minimal Hono + Better Auth server on a second port serving `/api/auth/*`.
Axum validates sessions by querying the Better Auth sessions table in PostgreSQL.

```
Frontend  →  /api/auth/*  →  Hono + Better Auth JS (port 3001)
Frontend  →  /api/*       →  Axum (port 3000)
Both write/read the same PostgreSQL database
```

**Pros:** Better Auth TS SDK works exactly as designed; OAuth support is mature
**Cons:** Adds a Node.js process; two services to run locally and in production

### Option C: `better-auth` Rust crate
Use the Rust crate as the auth backend and hope the TS SDK is compatible.

**Verdict:** Rejected — see above. Risk too high for a foundational layer.

---

## Additional finding: better-auth-rs v1 branch

A v1 branch exists claiming "full compatibility with better-auth@1.4.19" but:
- Not published to crates.io — requires a git dependency
- Uses SeaORM, not sqlx — conflicts with our chosen stack
- Axum example file returns 404 — API cannot be inspected
- Alpha status, actively changing

Attempting to spike on v1 would produce noise rather than signal.

## Decision: Option A — Pure Rust auth

**argon2 + sqlx + custom sessions table.** ~200 lines of Rust. No external auth
crate dependency. Directly proves the Axum middleware pattern and session storage
model.

Cookie name `better-auth.session_token` used to maintain forward compatibility
with Better Auth's session token format. If better-auth-rs v1 stabilises with
sqlx support, migrating is a schema-compatible drop-in.

**Session strategy confirmed:** Server-side sessions in PostgreSQL. Opaque token
in HTTP-only cookie, validated against `sessions` table on every protected request.
