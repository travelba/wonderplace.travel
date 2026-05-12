/**
 * Vitest-only stub for the `server-only` package.
 *
 * Next.js' real `server-only` throws at import time when bundled into a
 * client component to enforce server/client separation. Inside the
 * Vitest runtime there are no client components — every module is
 * loaded as plain ESM — so the import would crash even for pure server
 * code under test. This file replaces the package via an alias in
 * `vitest.config.ts` and intentionally exports nothing.
 *
 * Do NOT import this file from production code. The alias only applies
 * to the Vitest module resolver.
 */
export {};
