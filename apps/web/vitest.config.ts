import { defineConfig } from 'vitest/config';

/**
 * Vitest config (apps/web).
 *
 * We do not currently ship unit tests for `apps/web` (skill:
 * test-strategy — coverage lives at the package boundary). Vitest is
 * kept available so `pnpm -r test` succeeds with `--passWithNoTests`,
 * but it MUST NOT walk into `e2e/` where Playwright `*.spec.ts` files
 * live — they redeclare `test.describe` from `@playwright/test` and
 * would crash the Vitest collector.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['e2e/**', 'node_modules/**', '.next/**'],
    passWithNoTests: true,
  },
});
