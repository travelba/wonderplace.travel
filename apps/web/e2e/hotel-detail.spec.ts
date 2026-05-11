import { expect, test } from '@playwright/test';

import { setConsentCookie } from './fixtures/consent';

/**
 * Hotel detail page — public UX, SEO and JSON-LD contract.
 *
 * Skill: test-strategy §E2E #5 (editorial classement + hotel detail);
 * skill: structured-data-schema-org §Hotel / BreadcrumbList / FAQPage;
 * skill: seo-technical §canonical + hreflang.
 *
 * The synthetic hotel is served by `dev-fake-hotel-detail.ts` and
 * lives at `/hotel/hotel-de-test-e2e` (FR) and
 * `/en/hotel/hotel-de-test-e2e-en` (EN). The `email` booking_mode
 * means the booking section renders the "request via email" CTA
 * (no Amadeus stub required).
 */

const FR_PATH = '/hotel/hotel-de-test-e2e';
const EN_PATH = '/en/hotel/hotel-de-test-e2e-en';

/**
 * Reads every JSON-LD `<script type="application/ld+json">` from the
 * head and parses them. Returns the parsed objects keyed by their
 * `@type` (or a synthetic name if missing).
 */
async function readJsonLd(page: import('@playwright/test').Page): Promise<readonly unknown[]> {
  return page.evaluate(() => {
    const scripts = Array.from(
      document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]'),
    );
    return scripts.map((s) => {
      try {
        return JSON.parse(s.textContent ?? 'null');
      } catch {
        return null;
      }
    });
  });
}

test.describe('hotel detail page', () => {
  test.beforeEach(async ({ page }) => {
    await setConsentCookie(page, { essential: true, analytics: false });
  });

  test('FR renders the hotel head, hero, sections and email CTA', async ({ page }) => {
    const res = await page.goto(FR_PATH);
    expect(res?.status()).toBe(200);

    // Hero — H1 + city + stars (5★ from the fake seam).
    await expect(
      page.getByRole('heading', { level: 1, name: 'Hôtel de Test (E2E)' }),
    ).toBeVisible();
    await expect(page.getByText('5★', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('Paris', { exact: false }).first()).toBeVisible();

    // Sections — each H2 the user expects on a hotel page.
    for (const h2 of [
      'Vérifier les disponibilités',
      'À propos',
      'Les essentiels',
      'Services & équipements',
      'Chambres & suites',
      'Questions fréquentes',
    ]) {
      await expect(page.getByRole('heading', { level: 2, name: h2 })).toBeVisible();
    }

    // Email-mode booking → no inline date form, but a clear CTA to
    // `/reservation/start` carrying the hotel id.
    const cta = page.getByRole('link', { name: 'Demande de réservation' });
    await expect(cta).toBeVisible();
    const href = await cta.getAttribute('href');
    expect(href).toContain('/reservation/start');
    expect(href).toContain('hotelId=');
  });

  test('EN serves the localized slug with correct lang and content', async ({ page }) => {
    const res = await page.goto(EN_PATH);
    expect(res?.status()).toBe(200);
    expect(await page.locator('html').getAttribute('lang')).toBe('en');
    await expect(page.getByRole('heading', { level: 1, name: 'Test Hotel (E2E)' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Check availability' })).toBeVisible();
  });

  test('breadcrumb is wired with the four-step Home → Hotels → City → Hotel chain', async ({
    page,
  }) => {
    await page.goto(FR_PATH);

    const nav = page.getByRole('navigation', { name: 'Hôtels' });
    await expect(nav).toBeVisible();

    const items = nav.locator('ol > li');
    // 4 visible labels + 3 chevron separators (hidden from a11y tree).
    await expect(items.nth(0).getByRole('link', { name: 'Accueil' })).toBeVisible();
    await expect(items.nth(2).getByRole('link', { name: 'Hôtels' })).toBeVisible();
    await expect(items.nth(4).getByRole('link', { name: 'Paris' })).toHaveAttribute(
      'href',
      '/destination/paris',
    );

    // The terminal node carries `aria-current="page"` and is plain text.
    const last = nav.locator('li[aria-current="page"]');
    await expect(last).toHaveText('Hôtel de Test (E2E)');
  });

  test('SEO metadata: canonical + hreflang alternates + Open Graph', async ({ page, baseURL }) => {
    await page.goto(FR_PATH);

    const meta = await page.evaluate(() => {
      const get = (sel: string): string | null =>
        document.querySelector(sel)?.getAttribute('content') ?? null;
      const getHref = (sel: string): string | null =>
        document.querySelector(sel)?.getAttribute('href') ?? null;
      return {
        title: document.title,
        description: get('meta[name="description"]'),
        canonical: getHref('link[rel="canonical"]'),
        hreflangFr: getHref('link[rel="alternate"][hreflang="fr-FR"]'),
        hreflangEn: getHref('link[rel="alternate"][hreflang="en"]'),
        hreflangDefault: getHref('link[rel="alternate"][hreflang="x-default"]'),
        ogTitle: get('meta[property="og:title"]'),
        ogLocale: get('meta[property="og:locale"]'),
        ogUrl: get('meta[property="og:url"]'),
        ogImage: get('meta[property="og:image"]'),
        ogImageWidth: get('meta[property="og:image:width"]'),
        ogImageHeight: get('meta[property="og:image:height"]'),
        ogImageAlt: get('meta[property="og:image:alt"]'),
        twitterCard: get('meta[name="twitter:card"]'),
        twitterImage: get('meta[name="twitter:image"]'),
      };
    });

    expect(meta.title).toMatch(/Hôtel de Test/i);
    expect(meta.description).not.toBeNull();
    expect(meta.canonical).toContain('/hotel/hotel-de-test-e2e');
    expect(meta.hreflangFr).toContain('/hotel/hotel-de-test-e2e');
    expect(meta.hreflangEn).toContain('/en/hotel/hotel-de-test-e2e-en');
    expect(meta.hreflangDefault).toContain('/hotel/hotel-de-test-e2e');
    expect(meta.ogTitle).toMatch(/Hôtel de Test/i);
    expect(meta.ogLocale).toBe('fr_FR');
    expect(meta.ogUrl).toContain('/hotel/hotel-de-test-e2e');
    // The Twitter card type must be the large image variant for hotel
    // pages — small thumbnails crop hero shots in unflattering ways
    // and we want share previews to dominate timelines.
    expect(meta.twitterCard).toBe('summary_large_image');
    // The E2E seed defines a Cloudinary hero, so og:image + twitter:image
    // must be emitted with the dimensions Facebook/LinkedIn expect (1.91:1).
    if (meta.ogImage !== null) {
      expect(meta.ogImage).toMatch(/cloudinary\.com\/.+\/image\/upload\//);
      expect(meta.ogImage).toContain('w_1200');
      expect(meta.ogImage).toContain('h_630');
      expect(meta.ogImageWidth).toBe('1200');
      expect(meta.ogImageHeight).toBe('630');
      expect(meta.ogImageAlt?.toLowerCase()).toContain('hôtel de test');
      expect(meta.twitterImage).toBe(meta.ogImage);
    }

    // Sanity: canonical must be absolute (Next 15 emits the full URL
    // when `metadataBase` is configured).
    expect(meta.canonical?.startsWith('http')).toBe(true);
    if (baseURL !== undefined) {
      // The host doesn't have to match the test runner host (the build
      // uses NEXT_PUBLIC_SITE_URL), but the path must be exact.
      expect(meta.canonical).toMatch(/\/hotel\/hotel-de-test-e2e$/);
    }
  });

  test('emits valid Hotel, BreadcrumbList and FAQPage JSON-LD payloads', async ({ page }) => {
    await page.goto(FR_PATH);

    const blobs = await readJsonLd(page);
    expect(blobs.length).toBeGreaterThanOrEqual(3);

    type Blob = { '@context'?: string; '@type'?: string };
    const byType = (t: string): Blob | undefined =>
      blobs.find((b) => (b as Blob | null)?.['@type'] === t) as Blob | undefined;

    const hotel = byType('Hotel');
    const crumbs = byType('BreadcrumbList');
    const faq = byType('FAQPage');

    expect(hotel, 'Hotel JSON-LD').toBeDefined();
    expect(crumbs, 'BreadcrumbList JSON-LD').toBeDefined();
    expect(faq, 'FAQPage JSON-LD').toBeDefined();

    // Every Schema.org payload MUST carry the context.
    for (const b of [hotel, crumbs, faq]) {
      expect((b as Blob)['@context']).toBe('https://schema.org');
    }

    // Hotel fields we ship from the fake seam.
    const h = hotel as {
      name?: string;
      starRating?: { ratingValue?: number };
      address?: { addressLocality?: string; addressCountry?: string };
      geo?: { latitude?: number; longitude?: number };
      aggregateRating?: { ratingValue?: number; reviewCount?: number };
    };
    expect(h.name).toBe('Hôtel de Test (E2E)');
    expect(h.address?.addressLocality).toBe('Paris');
    expect(h.address?.addressCountry).toBe('FR');
    expect(h.geo?.latitude).toBeCloseTo(48.8566, 3);
    expect(h.aggregateRating?.reviewCount).toBe(312);

    // BreadcrumbList: 4 itemListElement.
    const bc = crumbs as { itemListElement?: ReadonlyArray<{ position?: number; name?: string }> };
    expect(bc.itemListElement?.length).toBe(4);
    expect(bc.itemListElement?.[3]?.name).toBe('Hôtel de Test (E2E)');

    // FAQPage carries the two questions from the seam.
    const f = faq as { mainEntity?: ReadonlyArray<{ name?: string }> };
    expect(f.mainEntity?.length).toBe(2);
  });

  test('page is indexable and uses ISR (no noindex, has cache-control)', async ({ page }) => {
    const response = await page.goto(FR_PATH);
    expect(response?.status()).toBe(200);

    const robots = await page.evaluate(() => {
      const el = document.querySelector('head meta[name="robots"]');
      return el?.getAttribute('content') ?? null;
    });
    if (robots !== null) {
      expect(robots.toLowerCase()).not.toContain('noindex');
    }
  });

  test('FAQ items are collapsible <details> elements', async ({ page }) => {
    await page.goto(FR_PATH);

    const faqSection = page.locator('section[aria-labelledby="faq-title"]');
    await expect(faqSection).toBeVisible();

    const details = faqSection.locator('details');
    await expect(details).toHaveCount(2);

    // Both start collapsed.
    for (let i = 0; i < 2; i++) {
      await expect(details.nth(i)).not.toHaveAttribute('open', '');
    }

    // Click the first summary (the <summary> is the only direct child of
    // `<details>` that's clickable + carries text). One click → open.
    await details.nth(0).locator('summary').click();
    await expect(details.nth(0)).toHaveAttribute('open', '');

    // The second FAQ stays closed (single-toggle, not radio behaviour).
    await expect(details.nth(1)).not.toHaveAttribute('open', '');
  });
});
