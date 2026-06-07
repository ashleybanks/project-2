## 1. Monorepo Scaffolding

- [x] 1.1 Initialise monorepo structure: `apps/web` (React + TypeScript + Vite), `apps/api` (Rust + Axum), root-level tooling config. Acceptance: `apps/web` and `apps/api` exist as independently buildable projects in one repo.
- [x] 1.2 Create a `.env` file (gitignored) at repo root with `DATABASE_URL` pointing at the local PostgreSQL instance. Create a `.env.example` with the expected variable names and placeholder values. Acceptance: `apps/api` connects to local PostgreSQL via `DATABASE_URL`; `.env` is in `.gitignore`.
- [x] 1.3 Add root-level `Makefile` or `justfile` with `dev`, `build`, and `test` targets that delegate to each app. Acceptance: a single command starts both frontend and backend in dev mode.

## 2. Rust Ecosystem Evaluation

- [x] 2.1 Evaluate the `better-auth` Rust crate ([crates.io](https://crates.io/crates/better-auth), also `better-auth-core`, `better-auth-api`): confirm whether its HTTP API endpoints are compatible with the Better Auth TypeScript SDK (i.e. can the TS frontend SDK talk to a Rust `better-auth` backend?). Check maintenance activity, version, and Axum integration quality. Document findings in `apps/api/docs/better-auth-eval.md`. Acceptance: compatibility verdict recorded with evidence (test or API comparison).
- [x] 2.2 [DECISION NEEDED] Based on 2.1: if the `better-auth` Rust crate is TS SDK-compatible, adopt it as the auth backend. If not, determine whether a Node.js Better Auth sidecar + thin Axum session validation middleware is the fallback, or whether a different auth approach is preferable. Acceptance: decision documented with rationale.
- [x] 2.3 Select Axum session validation approach (Option A: thin middleware querying `sessions` table; Option B: community crate; Option C: JWT fallback) based on findings from 2.1 and 2.2. Acceptance: approach selected, rationale noted in `better-auth-eval.md`.

## 3. Backend: Auth Routes and Session Middleware

- [x] 3.1 Add `sqlx`, `tokio`, `axum`, and `tower-http` to `apps/api/Cargo.toml`. Configure sqlx migrations. Acceptance: `cargo build` succeeds; migrations run via `sqlx migrate run`.
- [x] 3.2 Implement Better Auth session validation middleware for Axum: extract HTTP-only session cookie, query `sessions` table in PostgreSQL, return 401 on missing or expired session. Acceptance: middleware rejects requests with no cookie (401) and passes requests with a valid session, with `user_id` available in request extensions.
- [x] 3.3 Mount auth routes in the Axum router (sign-up, sign-in, sign-out) — either via Better Auth adapter or proxied Node sidecar depending on 2.2 outcome. Acceptance: `POST /api/auth/sign-up` and `POST /api/auth/sign-in` return expected responses.
- [x] 3.4 Add a protected test route `GET /api/me` that returns the authenticated user's ID and email. Acceptance: returns 200 + user data with valid session; returns 401 with no session.

## 4. Frontend: Auth Client and UI

- [x] 4.1 Scaffold `apps/web` with Vite + React + TypeScript. Add `better-auth` npm package. Configure `createAuthClient()` pointing to the Axum backend. Acceptance: `npm run dev` starts the frontend; Better Auth client initialises without errors.
- [x] 4.2 Implement sign-up and sign-in forms using Better Auth TypeScript SDK. Acceptance: a user can register and sign in via the UI; a session cookie is set in the browser after successful sign-in.
- [x] 4.3 Implement sign-out. Acceptance: clicking sign-out clears the session cookie and redirects to the sign-in page; a subsequent request to `GET /api/me` returns 401.
- [x] 4.4 Implement a protected route guard in React: unauthenticated users navigating to `/app/*` are redirected to `/sign-in` with the intended path preserved. Acceptance: direct navigation to `/app/dashboard` while unauthenticated redirects to `/sign-in?redirect=/app/dashboard`; post-login redirects correctly.

## 5. End-to-End Verification

- [x] 5.1 Verify the full flow end-to-end in a browser: register → sign in → access protected route → sign out → confirm protected route returns 401. Acceptance: all steps complete without error; session row visible in PostgreSQL during session, absent after sign-out.
- [x] 5.2 Verify session persistence: sign in, reload the page, confirm the user remains authenticated without re-entering credentials. Acceptance: session cookie survives page reload; `GET /api/me` returns 200 after reload.

## 6. Decision Documentation

- [x] 6.1 Write ADR-011 (session strategy: server-side sessions in PostgreSQL) based on spike findings, including evaluated alternatives and any deviations from the design. Acceptance: `openspec/changes/better-auth-spike/adr-011-session-strategy.md` committed; referenced in Obsidian ADR index.
- [x] 6.2 Update `openspec/config.yaml` and Obsidian Implementation Plan with confirmed Better Auth Rust approach. Acceptance: tech stack table reflects the chosen implementation; Better Auth spike item removed from open questions.
