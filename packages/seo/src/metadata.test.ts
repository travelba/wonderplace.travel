import { describe, expect, it } from 'vitest';

import { buildHreflangTags, buildPageMetadata } from './metadata';

describe('buildHreflangTags', () => {
  it('emits fr-FR, en, x-default for FR + EN', () => {
    const map = buildHreflangTags([
      { locale: 'fr', url: 'https://example.com/' },
      { locale: 'en', url: 'https://example.com/en/' },
    ]);
    expect(map).toEqual({
      'fr-FR': 'https://example.com/',
      en: 'https://example.com/en/',
      'x-default': 'https://example.com/',
    });
  });

  it('skips x-default when no FR alternate is provided', () => {
    const map = buildHreflangTags([{ locale: 'en', url: 'https://example.com/en/' }]);
    expect(map['x-default']).toBeUndefined();
  });
});

describe('buildPageMetadata', () => {
  it('sets canonical, hreflang, og defaults', () => {
    const md = buildPageMetadata({
      title: 'T',
      description: 'D',
      canonical: 'https://example.com/x',
      localeAlternates: [
        { locale: 'fr', url: 'https://example.com/x' },
        { locale: 'en', url: 'https://example.com/en/x' },
      ],
    });
    expect(md.alternates?.canonical).toBe('https://example.com/x');
    expect((md.alternates?.languages ?? {})['fr-FR']).toBe('https://example.com/x');
    expect(md.openGraph?.url).toBe('https://example.com/x');
    expect(md.openGraph?.type).toBe('website');
    expect(md.robots).toBeUndefined();
  });

  it('emits noindex robots when requested', () => {
    const md = buildPageMetadata({
      title: 'T',
      description: 'D',
      canonical: 'https://example.com/r',
      localeAlternates: [{ locale: 'fr', url: 'https://example.com/r' }],
      noIndex: true,
    });
    expect(md.robots).toMatchObject({ index: false, follow: false });
  });
});
