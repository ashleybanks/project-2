## Why

Auth spans both the React frontend (sign-in flows, session state, OAuth) and the Axum backend (session validation, protected route middleware). Better Auth is the chosen framework, but the Rust ecosystem side is immature — we need to evaluate available implementations for Axum compatibility and session strategy before the auth layer is built into Phase 1 properly. Getting this wrong early is expensive to unpick.

## What Changes

- Evaluate available Better Auth Rust implementations (compatibility with Axum middleware, session handling, OAuth provider support)
- Implement a minimal end-to-end auth flow: sign-up, sign-in, sign-out, protected route
- Validate session strategy decision: JWT vs. server-side sessions stored in PostgreSQL
- Establish the monorepo structure with frontend (React + TypeScript) and backend (Rust + Axum) co-located
- Produce a documented decision on which Rust implementation to use (or a recommendation to implement a thin adapter if no existing implementation is sufficient)

## Capabilities

### New Capabilities

- `authentication`: End-to-end auth flow covering sign-up, sign-in, sign-out, and session validation across the React frontend and Axum backend using Better Auth

### Modified Capabilities

_(none — greenfield)_

## Impact

- **Dependencies**: Better Auth (npm), Better Auth Rust implementation (TBD), Axum, PostgreSQL (sessions table if server-side strategy chosen)
- **Frontend**: React app scaffolded with Better Auth TypeScript SDK wired to the backend
- **Backend**: Axum app with auth middleware, session validation, and at least one protected route
- **Monorepo**: Initial project structure established for all subsequent Phase 1 work
- **Decision output**: Session strategy (JWT vs. server-side) documented as ADR-011

## Non-goals

- Full OAuth provider integration (e.g. Google, GitHub) — connection proven but not production-hardened
- Role-based access control or permissions
- Password reset / email verification flows
- Production-grade security hardening
- Any application features beyond auth scaffolding

## Phase

Phase 1 — prerequisite spike. Must be completed before UI or API work begins.
