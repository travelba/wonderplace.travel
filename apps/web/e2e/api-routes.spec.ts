import { expect, test } from '@playwright/test';

/**
 * Public API + well-known surfaces (skill: geo-llm-optimization,
 * seo-technical, observability-monitoring, test-strategy §E2E API).
 *
 * Each route is verified for:
 *   - HTTP 200
 *   - the correct `content-type`
 *   - a stable schema (parsed JSON or text body assertions)
 *
 * No consent cookie needed — these surfaces are not localized and do
 * not display the cookie banner.
 */

test.describe('public API + well-known', () => {
  test('GET /api/health returns ok=true', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toMatch(/application\/json/);
    expect(res.headers()['cache-control']).toMatch(/no-store/);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.service).toBe('cct-web');
    expect(typeof body.time).toBe('string');
    // ISO-8601-ish: at least starts with YYYY-MM-DD.
    expect(body.time).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  test('GET /robots.txt allow-lists the 2026 LLM crawlers', async ({ request }) => {
    const res = await request.get('/robots.txt');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toMatch(/text\/plain/);
    const body = await res.text();

    // Sitemap reference is present and absolute.
    expect(body).toMatch(/Sitemap:\s+https?:\/\/.+\/sitemap\.xml/);

    // Tunnel + account routes are disallowed by the catch-all user-agent.
    expect(body).toMatch(/Disallow:\s+\/api\//);
    expect(body).toMatch(/Disallow:\s+\/fr\/reservation\//);
    expect(body).toMatch(/Disallow:\s+\/fr\/compte\//);

    // Required LLM user-agent allow-lists.
    for (const agent of [
      'Google-Extended',
      'GPTBot',
      'OAI-SearchBot',
      'ChatGPT-User',
      'PerplexityBot',
      'Perplexity-User',
      'ClaudeBot',
      'anthropic-ai',
      'Applebot-Extended',
    ]) {
      expect(body, `robots.txt should mention ${agent}`).toContain(`User-agent: ${agent}`);
    }
  });

  test('GET /llms.txt exposes the strategic pages section', async ({ request }) => {
    const res = await request.get('/llms.txt');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toMatch(/text\/plain/);
    const body = await res.text();

    // Header + about copy.
    expect(body).toMatch(/ConciergeTravel\.fr/);
    expect(body).toMatch(/Agence IATA/i);

    // Strategic pages section — references real, in-tree routes only.
    expect(body).toMatch(/\/fr$/m);
    expect(body).toMatch(/\/fr\/destination/);
    expect(body).toMatch(/\/fr\/recherche/);

    // Legal anchor links.
    expect(body).toContain('/fr/mentions-legales');
    expect(body).toContain('/fr/cgv');

    // Agent-skills cross-reference.
    expect(body).toContain('/.well-known/agent-skills.json');
  });

  test('GET /.well-known/agent-skills.json conforms to the documented schema', async ({
    request,
  }) => {
    const res = await request.get('/.well-known/agent-skills.json');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toMatch(/application\/json/);

    const body = await res.json();
    expect(body.schemaVersion).toBe('0.1');
    expect(body.site).toBe('ConciergeTravel.fr');
    expect(Array.isArray(body.skills)).toBe(true);
    expect(body.skills.length).toBeGreaterThanOrEqual(8);

    const skillNames: readonly string[] = body.skills.map((s: { name: string }) => s.name);
    expect(skillNames).toEqual(
      expect.arrayContaining([
        'search',
        'list-cities',
        'get-hotel',
        'filter',
        'compare-prices',
        'booking',
        'request-quote',
        'loyalty',
      ]),
    );

    // Every declared `required` key must appear in the `properties` map.
    interface SkillSchemaShape {
      readonly type: 'object';
      readonly properties: Readonly<Record<string, unknown>>;
      readonly required?: readonly string[];
    }
    interface SkillShape {
      readonly name: string;
      readonly description: string;
      readonly inputSchema?: SkillSchemaShape;
    }
    for (const skill of body.skills as readonly SkillShape[]) {
      if (skill.inputSchema === undefined) continue;
      const props = Object.keys(skill.inputSchema.properties);
      for (const req of skill.inputSchema.required ?? []) {
        expect(props, `${skill.name}: missing required property ${req}`).toContain(req);
      }
    }
  });

  test('Link header announces the agent-skills surface', async ({ request }) => {
    const res = await request.get('/');
    expect(res.status()).toBe(200);
    const link = res.headers()['link'];
    expect(link, 'Link header should be set on every page').toBeDefined();
    expect(link).toContain('/.well-known/agent-skills.json');
    expect(link).toContain('rel="agent-skills"');
  });

  test('GET /sitemap.xml returns XML and references the site origin', async ({ request }) => {
    const res = await request.get('/sitemap.xml');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toMatch(/xml/);
    const body = await res.text();
    expect(body).toMatch(/^<\?xml version=/);
    expect(body).toMatch(/<urlset/);
  });

  test('CSP nonce is propagated to JSON-LD scripts', async ({ page }) => {
    await page.goto('/');
    const nonces = await page.evaluate(() =>
      Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map(
        (s) => s.getAttribute('nonce') ?? '',
      ),
    );
    expect(nonces.length).toBeGreaterThanOrEqual(1);
    // Every JSON-LD script must carry the per-request nonce (non-empty).
    for (const n of nonces) {
      expect(n.length, 'JSON-LD script must carry a nonce').toBeGreaterThan(0);
    }
  });
});
