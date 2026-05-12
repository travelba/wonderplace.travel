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
    // Lines have the format `- {absolute-url} — {description}`, so the
    // bare `/fr` root is followed by ` — ` (space-em-dash-space).
    expect(body).toMatch(/\/fr\s+—/);
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

  test('GET /sitemap.xml returns a sitemap index pointing at sub-sitemaps', async ({ request }) => {
    const res = await request.get('/sitemap.xml');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toMatch(/xml/);
    const body = await res.text();
    expect(body).toMatch(/^<\?xml version=/);
    // `/sitemap.xml` is a `<sitemapindex>` (skill: seo-technical §Sitemaps)
    // that fans out to per-collection sub-sitemaps. The `<urlset>` shape
    // is only used by those sub-sitemaps.
    expect(body).toMatch(/<sitemapindex/);
    for (const sub of ['hotels', 'rooms', 'hubs', 'editorial', 'guides']) {
      expect(body).toContain(`/sitemaps/${sub}.xml`);
    }
  });

  test('CSP nonce is propagated to JSON-LD scripts', async ({ request }) => {
    // We MUST inspect raw HTML here. CSP3 (https://w3c.github.io/webappsec-csp/
    // §"Restrict Access to the Nonce IDL Attribute") requires browsers to
    // blank the `nonce` attribute on script elements after they've been
    // processed, so reading `document.querySelector('script').getAttribute('nonce')`
    // from Playwright's page context always returns "". Fetching the
    // server-rendered HTML directly bypasses this stripping and lets us
    // assert that the middleware nonce was actually emitted by SSR.
    const res = await request.get('/fr');
    expect(res.status()).toBe(200);

    // The response's CSP header carries the per-request nonce.
    const csp = res.headers()['content-security-policy'] ?? '';
    const cspNonceMatch = csp.match(/'nonce-([^']+)'/);
    expect(cspNonceMatch, 'CSP header should advertise a nonce-...').not.toBeNull();
    const cspNonce = cspNonceMatch?.[1] ?? '';
    expect(cspNonce.length).toBeGreaterThan(0);

    // Every JSON-LD <script> in the SSR HTML must carry the *same* nonce so
    // the browser-enforced CSP doesn't block our structured data.
    const html = await res.text();
    const scriptMatches = Array.from(
      html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>/g),
    );
    expect(scriptMatches.length).toBeGreaterThanOrEqual(1);
    for (const m of scriptMatches) {
      const nonceMatch = m[0].match(/nonce="([^"]+)"/);
      expect(nonceMatch, `script must carry a nonce: ${m[0]}`).not.toBeNull();
      expect(nonceMatch?.[1]).toBe(cspNonce);
    }
  });
});
