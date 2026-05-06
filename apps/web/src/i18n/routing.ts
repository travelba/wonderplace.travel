import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['fr', 'en'],
  defaultLocale: 'fr',
  // FR served from the root, EN under /en/. Matches CDC §3.1.
  localePrefix: {
    mode: 'as-needed',
    prefixes: { fr: '/', en: '/en' },
  },
});

export type Locale = (typeof routing.locales)[number];
