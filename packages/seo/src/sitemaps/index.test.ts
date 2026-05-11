import { describe, expect, it } from 'vitest';

import { buildSitemapIndexXml, buildSitemapXml } from './index';

describe('buildSitemapXml', () => {
  it('escapes XML-special characters in URLs', () => {
    const xml = buildSitemapXml([{ loc: 'https://example.com/?q=a&b=1' }]);
    expect(xml).toContain('<loc>https://example.com/?q=a&amp;b=1</loc>');
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
  });

  it('drops invalid priorities silently', () => {
    const xml = buildSitemapXml([{ loc: 'https://x', priority: 2.5 }]);
    expect(xml).not.toContain('<priority>');
  });

  it('emits hreflang alternates inside <url>', () => {
    const xml = buildSitemapXml([
      {
        loc: 'https://x/fr/',
        alternates: [
          { hreflang: 'fr-FR', href: 'https://x/' },
          { hreflang: 'en', href: 'https://x/en/' },
        ],
      },
    ]);
    expect(xml).toContain('xhtml:link');
    expect(xml).toContain('hreflang="fr-FR"');
    expect(xml).toContain('hreflang="en"');
  });
});

describe('buildSitemapIndexXml', () => {
  it('lists sitemaps with optional lastmod', () => {
    const xml = buildSitemapIndexXml([
      { loc: 'https://x/sitemaps/hotels.xml', lastmod: '2026-05-11T10:00:00Z' },
      { loc: 'https://x/sitemaps/editorial.xml' },
    ]);
    expect(xml).toContain('<sitemapindex');
    expect(xml).toContain('https://x/sitemaps/hotels.xml');
    expect(xml).toContain('<lastmod>2026-05-11T10:00:00Z</lastmod>');
  });
});
