---
name: test-strategy
description: Test strategy for ConciergeTravel.fr — unit (Vitest), integration (Vitest + MSW), E2E (Playwright), accessibility (axe), Lighthouse CI. Use whenever you add or change tests, test config, or coverage rules.
---

# Test strategy — ConciergeTravel.fr

We follow the **trophy** model: a thick base of unit tests on `packages/domain/`, a strong integration layer on `packages/integrations/` with mocked vendors, and focused E2E on critical user journeys. Lighthouse CI guards performance.

## Triggers

Invoke when:

- Adding business logic, an integration, a route, or a UI flow that must be regression-protected.
- Editing CI test workflows.
- Adjusting coverage thresholds or fixtures.

## Frameworks

- **Unit/integration**: Vitest + `@vitest/coverage-v8`.
- **HTTP mocking**: MSW for vendor APIs.
- **DOM**: `@testing-library/react` for React Email + UI components.
- **E2E**: Playwright (Chromium, WebKit, Firefox; mobile viewport project).
- **a11y**: `@axe-core/playwright`.
- **Performance**: Lighthouse CI on 5 strategic URLs.

## Coverage targets

- `packages/domain/**` — **≥ 90%** lines / branches.
- `packages/integrations/**` — **≥ 80%** lines (mocked).
- `apps/web/**` — **≥ 70%** for server actions, route handlers, business components.
- `apps/admin/**` — **≥ 60%** (CMS surface, mostly Payload).

## Non-negotiable rules

### Unit tests

- Live next to source: `*.test.ts(x)`.
- Pure: no network, no DB. Inject ports.
- Test boundary conditions and error cases.
- Snapshot tests reserved for pure rendering of small atoms; refuse for full pages.

### Integration tests

- Use MSW handlers in `tests/fixtures/msw/<vendor>.ts`.
- Cover happy path + 429 + 5xx + parse failure for each integration function.
- Validate Zod parse errors propagate as typed `Result.err({ kind: 'parse_failure' })`.

### E2E tests (Playwright)

Mandatory journeys:

1. **Search → results → hotel detail → booking tunnel → confirmation** on mobile viewport (375×812) and desktop (1280×720).
2. **Email-mode booking request** (hotel with `booking_mode = 'email'`).
3. **Account flow** (signup, login, view bookings, view loyalty).
4. **Editorial pages** SEO checks: titles, JSON-LD validity, breadcrumbs, hreflang, canonical.
5. **Price comparator** rendering + scenarios (cheaper / equal_with_benefits / more_expensive).
6. **Sitemap and robots** content checks.

### a11y

- Run `axe.run()` on home, hotel detail, booking step 3, account, editorial classement.
- Must report **zero serious violations**.

### Lighthouse CI

- Targets per CDC §9.2 (Mobile LCP < 2.0s, CLS < 0.05, INP < 200ms, score > 90).
- Run on PRs and main branch.

### Test data

- Fixtures in `tests/fixtures/` (`amadeus/*.json`, `little/*.json`, `makcorps/*.json`).
- Database fixtures use Supabase local (`supabase start`) or in-memory pglite for super-fast unit tests.

### Flake control

- Retries: 1 in CI, 0 locally.
- No sleep-based waits — use Playwright auto-waiting + custom `expect.poll`.

## Anti-patterns to refuse

- Tests calling real Amadeus/Little/Makcorps in CI (only nightly smoke job).
- Snapshotting full HTML pages.
- Using `setTimeout` to wait for state.
- Mocking `fetch` globally instead of per-request via MSW.
- Skipped tests committed without a tracking issue.

## CI integration

- `lint`, `typecheck`, `test:unit` run on every PR.
- `test:e2e` runs on PR opened against `main` and on push to `main`.
- `lighthouse-ci` runs on push to `main` and weekly on `production`.
- Nightly job: smoke E2E against Amadeus test environment.

## References

- CDC v3.0 §9.2 (Core Web Vitals), §12 (acceptance checklists).
- `cicd-release-management`, `performance-engineering`, `accessibility` skills.
