import { describe, expect, it } from 'vitest';

import { buildLlmsFullTxt, buildLlmsTxt } from './index';

describe('buildLlmsTxt', () => {
  it('emits sections with URL + description bullets', () => {
    const out = buildLlmsTxt({
      siteName: 'ConciergeTravel.fr',
      tagline: 'Hôtels 5★ France',
      originUrl: 'https://example.com',
      about: 'Description.',
      lastUpdatedDate: '2026-05-11',
      sections: [
        {
          title: 'Pages stratégiques',
          items: [{ url: 'https://example.com/x', description: 'Page X' }],
        },
      ],
    });
    expect(out).toContain('# ConciergeTravel.fr — Hôtels 5★ France');
    expect(out).toContain('## Pages stratégiques');
    expect(out).toContain('- https://example.com/x — Page X');
    expect(out).toContain('Dernière mise à jour : 2026-05-11');
  });
});

describe('buildLlmsFullTxt', () => {
  it('emits per-page summary + key facts', () => {
    const out = buildLlmsFullTxt({
      siteName: 'CT',
      tagline: 'Tagline',
      originUrl: 'https://example.com',
      about: 'About.',
      lastUpdatedDate: '2026-05-11T08:00:00Z',
      pages: [
        {
          url: 'https://example.com/a',
          title: 'Page A',
          summary: 'Résumé.',
          keyFacts: ['Fait 1', 'Fait 2'],
          updatedAt: '2026-04-01',
        },
      ],
    });
    expect(out).toContain('## Page A');
    expect(out).toContain('URL: https://example.com/a');
    expect(out).toContain('Last updated: 2026-04-01');
    expect(out).toContain('- Fait 1');
    expect(out).toContain('- Fait 2');
    expect(out).toContain('Dernière mise à jour : 2026-05-11');
  });
});
