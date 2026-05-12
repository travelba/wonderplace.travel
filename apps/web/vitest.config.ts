import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Vitest config (apps/web).
 *
 * The bulk of `apps/web` coverage lives at the package boundary
 * (skill: test-strategy), but we do ship a handful of pure-data reader
 * tests that need to import from `src/server/**` modules. Those modules
 * top-load `import 'server-only'`, which Next.js intercepts and replaces
 * with a runtime that throws inside non-RSC bundlers — including Vitest.
 *
 * The alias below points `server-only` at an empty stub file so the
 * import is a no-op in the test environment. Production builds and
 * dev-mode Next.js are unaffected (they resolve `server-only` from
 * `node_modules`).
 */
export default defineConfig({
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['e2e/**', 'node_modules/**', '.next/**'],
    passWithNoTests: true,
    alias: {
      'server-only': path.resolve(__dirname, 'src/test/server-only-stub.ts'),
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
