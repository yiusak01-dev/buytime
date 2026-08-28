import { createRouter } from "./router";

// startInstance must be client-safe (no @tanstack/react-start/server imports).
// Server-side request handling is done by src/server.ts via @tanstack/react-start/server-entry.
// TanStack Start's client hydration uses this to set up the router.
export const startInstance = createRouter();
