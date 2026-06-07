# ADR-011: Session Strategy — Server-Side Sessions in PostgreSQL

**Status:** Accepted
**Date:** 2026-06-07

---

## Context

The spike evaluated Better Auth Rust implementations to determine the auth approach for the Axum backend. The `better-auth` Rust crate (v0.10.0) and `better-auth-rs` v1 branch were evaluated. Neither was suitable: v0.10.0 is not protocol-compatible with the Better Auth TypeScript SDK, and v1 is alpha-only, uses SeaORM (conflicts with our sqlx stack), and had inaccessible example code.

The spike implemented a pure Rust auth layer using argon2 + sqlx + custom sessions table.

---

## Decision

**Server-side sessions stored in PostgreSQL.** The session token is a 64-character hex string (32 random bytes), sent as an HTTP-only cookie named `better-auth.session_token`. On each authenticated request, Axum middleware validates the token by querying the `sessions` table.

Cookie name `better-auth.session_token` is used for forward compatibility: if `better-auth-rs` matures and adds sqlx support, the session schema and cookie name will be compatible.

---

## Alternatives Considered

| Option | Rejected because |
|---|---|
| `better-auth` Rust crate (v0.10.0) | Not protocol-compatible with Better Auth TS SDK |
| `better-auth-rs` v1 branch | Alpha, uses SeaORM not sqlx, example code inaccessible |
| JWT (stateless) | Requires token denylist for immediate invalidation; added complexity with no benefit at current scale |
| Hono sidecar + Axum session validation | Adds a Node.js process; unnecessary when a pure Rust implementation is sufficient |

---

## Tradeoffs Accepted

- One PostgreSQL query per authenticated request (validate session on each call). Acceptable at current scale. Mitigatable later with in-process LRU cache if it becomes a bottleneck.
- Auth routes (`/api/auth/*`) are implemented manually rather than delegated to a framework. More code to maintain, but full control and no external dependency risk.

---

## Schema

```sql
CREATE TABLE users (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT        NOT NULL UNIQUE,
    password_hash TEXT        NOT NULL,
    name          TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sessions (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token      TEXT        NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## Triggers to Revisit

- `better-auth-rs` v1 stabilises and publishes to crates.io with sqlx support — evaluate migration
- Session validation latency becomes measurable at scale — add in-process LRU cache
- OAuth provider support required before the manual auth layer has been extended — revisit Hono sidecar option
