## Context

This is a greenfield project. Auth is a cross-cutting concern that spans the React frontend (sign-in UI, session state, OAuth flows) and the Axum backend (session validation, protected route middleware). Better Auth is the chosen framework for its coherent TypeScript SDK and its positioning as a full-stack auth solution.

The risk: the Rust ecosystem for Better Auth is immature. No first-party Rust server integration exists at the time of writing. The spike must determine whether a community implementation is production-suitable, whether a thin custom adapter is needed, or whether an alternative approach (e.g. validating Better Auth sessions manually in Axum middleware) is the right path.

The spike also establishes the monorepo structure that all subsequent Phase 1 work will build on.

## Goals / Non-Goals

**Goals:**
- Establish monorepo project structure (frontend + backend co-located)
- Evaluate Better Auth Rust ecosystem options for Axum session validation
- Implement a minimal working auth flow end-to-end: sign-up, sign-in, sign-out, protected route
- Make and document the session strategy decision (JWT vs. server-side sessions in PostgreSQL)
- Produce ADR-011 capturing the decision and the evaluated options

**Non-Goals:**
- OAuth provider integration (Google, GitHub) — connection pattern proven is sufficient
- Password reset, email verification, or MFA
- Role-based access control
- Production security hardening (rate limiting, CSRF beyond defaults, etc.)
- Any application feature beyond auth scaffolding

## Decisions

### 1. Monorepo structure

```
project-2/
  apps/
    web/          # React + TypeScript (Vite)
    api/          # Rust + Axum
  openspec/
  .github/
  docker-compose.yml   # PostgreSQL + Ollama for local dev
```

`apps/web` and `apps/api` are independently buildable but co-located. A root-level `docker-compose.yml` covers local dev dependencies.

**Why not a separate repo per service:** Too much overhead for a two-person spike. Monorepo keeps the auth flow reviewable in one place and simplifies the spike feedback loop.

### 2. Session strategy — server-side sessions in PostgreSQL

**Decision: server-side sessions stored in PostgreSQL.**

Better Auth stores sessions in a `sessions` table (it manages this itself). The session token is an opaque value sent as an HTTP-only cookie. On each authenticated request, the Axum middleware validates the session by querying the `sessions` table.

| | Server-side sessions | JWT (stateless) |
|---|---|---|
| Immediate invalidation | ✓ (delete the row) | ✗ (need denylist) |
| Database round-trip per request | Yes (1 query) | No |
| Token size | Small (opaque ID) | Grows with claims |
| Complexity | Low | Low + denylist if revocation needed |
| PostgreSQL already in stack | ✓ fits naturally | — |

At early stage and low request volume, the database round-trip is not a concern. Immediate session invalidation (on sign-out, password change, suspicious activity) is a correctness requirement, not a performance trade-off. Server-side sessions are the right default.

### 3. Rust session validation approach

Three options to evaluate during the spike, in order of preference:

**Option A — Thin Axum middleware (validate against sessions table directly)**
Axum middleware extracts the session cookie, queries `sessions` in PostgreSQL, returns 401 if missing or expired. No external crate dependency beyond sqlx. Better Auth owns the session schema; we query it.

**Option B — Community crate (`better-auth-axum` or similar)**
If a maintained, well-tested crate exists, prefer it to reduce boilerplate. Evaluate for: Axum version compatibility, session strategy support, maintenance activity.

**Option C — Better Auth session format as JWT**
Better Auth can be configured to issue JWTs. Axum middleware validates the JWT signature using the shared secret. No database round-trip. Contradicts decision 2 — only fall back to this if server-side session query proves architecturally problematic.

The spike should try Option A first (most control, least dependency risk) and document whether Option B improves on it meaningfully.

### 4. Better Auth frontend integration

Better Auth's TypeScript SDK handles the frontend side: `createAuthClient()` wired to the Axum backend's auth routes. Sign-in/sign-out/session state managed by the SDK. React context wraps the auth client for component access.

Better Auth exposes auth routes at `/api/auth/*` — the Axum router mounts these (or proxies them if using a separate Better Auth server process, which is an evaluation point in the spike).

## Risks / Trade-offs

**[Risk] Better Auth Rust ecosystem is immature** → Mitigation: Option A (thin middleware) requires no external Rust auth crate — only sqlx, which is already in the stack. Worst case, we write ~100 lines of middleware.

**[Risk] Better Auth may require a Node.js sidecar for the auth server** → Mitigation: Evaluate during spike. If auth routes must run in Node, assess whether a lightweight Better Auth server process alongside Axum is acceptable, or whether an alternative (e.g. Auth.js, or a pure Rust auth lib like `argon2` + custom sessions) is preferable.

**[Risk] Session table schema from Better Auth may conflict with future schema needs** → Mitigation: Better Auth manages its own tables. Our application code does not own those tables. Accepted.

**[Trade-off] Server-side sessions require a DB query per request** → At current scale this is acceptable. If it becomes a bottleneck, a short-lived in-memory session cache (Redis, or even an in-process LRU) can be layered on without changing the auth model.

## Open Questions

1. **Does Better Auth require a Node.js process for the auth server, or can auth routes be served directly from Axum?** This is the primary unknown — the spike resolves it.
2. **Which community Rust crates (if any) are actively maintained for Better Auth + Axum?** Research during spike.
3. **OAuth provider config** — which providers (Google, GitHub, email) should be wired up in the spike? Email/password is sufficient to prove the flow; document OAuth as a follow-on.
