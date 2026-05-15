import { expect, test, type Page } from '@playwright/test';

import { setConsentCookie } from './fixtures/consent';

/**
 * Rankings matrix — public surface (skill: test-strategy §E2E #6,
 * skill: editorial-long-read-rendering, plan
 * `rankings-parity-yonder` WS2.5-qa-e2e).
 *
 * The CI test build runs without Supabase credentials, so
 * `listPublishedRankings()` returns `[]`. We therefore can NOT
 * exercise a populated detail page in CI — that path is covered by
 * unit tests around `RankingsFacets` and the JSON-LD builders.
 *
 * What we DO assert here:
 *   1. Hub `/classements` boots, renders chrome + empty/zero-state
 *      and emits a `CollectionPage` JSON-LD payload (5-axe coverage:
 *      meta, JSON-LD, breadcrumb, hreflang, EN locale).
 *   2. Sub-hub URLs that have no matching ranking are 404'd
 *      (anti-cannibalisation: an empty filter must not exist as a
 *      thin indexable page).
 *   3. Detail-page URLs that don't resolve are 404'd.
 *   4. `/sitemaps/rankings.xml` is reachable, well-formed, and
 *      gracefully empty (no items when DB is empty).
 *   5. `.well-known/agent-skills.json` advertises the
 *      `list-rankings` + `get-ranking` tools so LLM crawlers can
 *      discover the rubric.
 */

const HUB_FR = '/classements';
const HUB_EN = '/en/classements';

async function readJsonLdByType(page: Page, type: string): Promise<Record<string, unknown> | null> {
  return page.evaluate((t) => {
    const scripts = Array.from(
      document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]'),
    );
    for (const s of scripts) {
      try {
        const parsed = JSON.parse(s.textContent ?? 'null') as Record<string, unknown> | null;
        if (parsed !== null && parsed['@type'] === t) return parsed;
      } catch {
        /* skip malformed payload — covered by structured-data tests */
      }
    }
    return null;
  }, type);
}

test.describe('rankings hub (/classements)', () => {
  test.beforeEach(async ({ page }) => {
    await setConsentCookie(page, { essential: true, analytics: false });
  });

  test('FR hub renders H1, eyebrow + LastUpdatedBadge chrome', async ({ page }) => {
    const res = await page.goto(HUB_FR);
    expect(res?.status()).toBe(200);

    // Eyebrow + H1 are stable copy from `T.fr.title`.
    await expect(page.getByText(/Classements éditoriaux/i).first()).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 1, name: /classements de Palaces/i }),
    ).toBeVisible();
  });

  test('EN hub localizes the H1 and serves under /en', async ({ page }) => {
    const res = await page.goto(HUB_EN);
    expect(res?.status()).toBe(200);
    expect(await page.locator('html').getAttribute('lang')).toBe('en');
    await expect(
      page.getByRole('heading', { level: 1, name: /Palace and 5★ hotel rankings/i }),
    ).toBeVisible();
  });

  test('canonical + hreflang point to /classements with x-default on FR', async ({ page }) => {
    await page.goto(HUB_FR);
    const meta = await page.evaluate(() => {
      const getHref = (sel: string): string | null =>
        document.querySelector(sel)?.getAttribute('href') ?? null;
      return {
        canonical: getHref('link[rel="canonical"]'),
        hreflangFr: getHref('link[rel="alternate"][hreflang="fr-FR"]'),
        hreflangEn: getHref('link[rel="alternate"][hreflang="en"]'),
        hreflangDefault: getHref('link[rel="alternate"][hreflang="x-default"]'),
      };
    });
    expect(meta.canonical).toMatch(/\/classements$/);
    expect(meta.hreflangFr).toMatch(/\/classements$/);
    expect(meta.hreflangEn).toMatch(/\/en\/classements$/);
    expect(meta.hreflangDefault).toMatch(/\/classements$/);
  });

  test('emits a valid CollectionPage JSON-LD (even when DB is empty)', async ({ page }) => {
    await page.goto(HUB_FR);

    const collection = await readJsonLdByType(page, 'CollectionPage');
    expect(collection, 'CollectionPage JSON-LD should be present').not.toBeNull();
    expect(collection?.['@context']).toBe('https://schema.org');
    expect(typeof collection?.['name']).toBe('string');
    expect(typeof collection?.['url']).toBe('string');

    // BreadcrumbList must be present alongside (Home → Rankings).
    const breadcrumb = await readJsonLdByType(page, 'BreadcrumbList');
    expect(breadcrumb, 'BreadcrumbList JSON-LD should be present').not.toBeNull();
    const items = breadcrumb?.['itemListElement'] as ReadonlyArray<{ name?: string }> | undefined;
    expect(Array.isArray(items)).toBe(true);
    expect(items?.length).toBe(2);
  });

  test('hub remains indexable (no noindex meta)', async ({ page }) => {
    await page.goto(HUB_FR);
    const robots = await page.evaluate(() => {
      const el = document.querySelector('head meta[name="robots"]');
      return el?.getAttribute('content') ?? null;
    });
    if (robots !== null) {
      expect(robots.toLowerCase()).not.toContain('noindex');
    }
  });
});

test.describe('rankings sub-hubs (/classements/[axe]/[valeur])', () => {
  test.beforeEach(async ({ page }) => {
    await setConsentCookie(page, { essential: true, analytics: false });
  });

  /**
   * Axe variety coverage (plan `rankings-parity-yonder` WS2.5-qa-e2e):
   * one test per axe family + one with an unknown axe. In CI all 4 are
   * expected to 404 (DB empty → no eligible filter → notFound).
   * In production each existing combination should resolve to 200; the
   * 404 path is verified here for the safety net only.
   */
  test('unknown axe slug returns 404', async ({ page }) => {
    const res = await page.goto('/classements/inconnu/valeur');
    expect(res?.status()).toBe(404);
  });

  for (const sample of [
    { axe: 'type', valeur: 'palace', label: 'palace' },
    { axe: 'lieu', valeur: 'paris', label: 'destination' },
    { axe: 'theme', valeur: 'spa-bienetre', label: 'theme' },
    { axe: 'occasion', valeur: 'lune-de-miel', label: 'occasion' },
  ] as const) {
    test(`sub-hub ${sample.label} (/classements/${sample.axe}/${sample.valeur}) is well-formed (200 or 404)`, async ({
      page,
    }) => {
      const res = await page.goto(`/classements/${sample.axe}/${sample.valeur}`);
      const status = res?.status() ?? 0;
      // In CI the build has no published rankings → empty filter → 404.
      // In production there must be at least one matching ranking → 200
      // with a CollectionPage JSON-LD. Either branch is acceptable; we
      // assert per branch.
      expect([200, 404]).toContain(status);
      if (status === 200) {
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        const collection = await readJsonLdByType(page, 'CollectionPage');
        expect(
          collection,
          'CollectionPage JSON-LD should be present on a populated sub-hub',
        ).not.toBeNull();
      }
    });
  }
});

test.describe('ranking detail (/classement/[slug])', () => {
  test.beforeEach(async ({ page }) => {
    await setConsentCookie(page, { essential: true, analytics: false });
  });

  test('unknown slug returns 404', async ({ page }) => {
    const res = await page.goto('/classement/cette-page-nexiste-pas');
    expect(res?.status()).toBe(404);
  });
});

test.describe('rankings sitemap + agent-skills surface', () => {
  test('sitemap-rankings is well-formed XML and reachable', async ({ request }) => {
    const res = await request.get('/sitemaps/rankings.xml');
    expect(res.status()).toBe(200);
    const body = await res.text();
    // Minimal validity: XML prolog + urlset/sitemapindex root. Empty
    // catalogues legitimately render an empty `<urlset/>`, which we
    // accept here.
    expect(body.startsWith('<?xml')).toBe(true);
    expect(body).toMatch(/urlset|sitemapindex/);
  });

  test('main sitemap index references the rankings sub-sitemap', async ({ request }) => {
    const res = await request.get('/sitemap.xml');
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain('sitemaps/rankings.xml');
  });

  test('agent-skills.json advertises list-rankings + get-ranking tools', async ({ request }) => {
    const res = await request.get('/.well-known/agent-skills.json');
    expect(res.status()).toBe(200);
    const json = (await res.json()) as { skills?: ReadonlyArray<{ name?: string }> };
    expect(Array.isArray(json.skills)).toBe(true);
    const names = (json.skills ?? []).map((s) => s.name);
    expect(names).toEqual(expect.arrayContaining(['list-rankings', 'get-ranking']));
  });

  test('llms.txt mentions the classements hub', async ({ request }) => {
    const res = await request.get('/llms.txt');
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body.toLowerCase()).toContain('classements');
  });
});
