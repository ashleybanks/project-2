import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  // No absolute baseURL — requests go to the current origin (/api/auth/*),
  // which Vite proxies to the Axum backend in dev. Same in production
  // when frontend and backend share a domain.
  baseURL: window.location.origin,
});

export const { signIn, signUp, signOut, useSession } = authClient;
