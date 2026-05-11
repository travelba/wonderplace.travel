import { getTranslations } from 'next-intl/server';
import { Suspense, type ReactElement } from 'react';

import { Link } from '@/i18n/navigation';

import { AuthArea } from './auth-area';
import { LocaleSwitcher } from './locale-switcher';
import { MobileNav } from './mobile-nav';

/**
 * Site-wide top bar (skill: responsive-ui-architecture +
 * accessibility §landmarks).
 *
 * Structure:
 *   ┌─────────────────────────────────────────────────────────┐
 *   │ [Skip link]                                             │
 *   │ [Brand]   [Primary nav (md+)]   [Locale]  [Auth]  [☰]   │
 *   └─────────────────────────────────────────────────────────┘
 *
 *  - Pure Server Component — does NOT read `cookies()` so it stays
 *    static. The auth area is a client island that resolves the
 *    Supabase session in the browser via `<AuthArea />`. This is what
 *    enables pages underneath to opt into ISR instead of
 *    `force-dynamic` (ADR-0007, Sprint 4.1).
 *  - The skip-link is the first focusable element on every page and
 *    jumps to `#main` (set by the locale layout).
 *  - Desktop nav uses `<nav aria-label>` for a discoverable landmark.
 *  - Mobile nav is a focus-trapped overlay (`MobileNav`).
 */
export async function SiteHeader(): Promise<ReactElement> {
  const t = await getTranslations('header');

  return (
    <>
      <a
        href="#main"
        className="focus:bg-fg focus:text-bg sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[100] focus:rounded-md focus:px-3 focus:py-2 focus:text-sm"
      >
        {t('skipToContent')}
      </a>

      <header className="border-border bg-bg/95 sticky top-0 z-40 border-b backdrop-blur">
        <div className="container mx-auto flex max-w-screen-xl items-center gap-4 px-4 py-3">
          <Link
            href="/"
            className="text-fg focus-visible:ring-ring font-serif text-lg tracking-tight hover:opacity-90 focus-visible:outline-none focus-visible:ring-2"
            aria-label={t('brand')}
          >
            {t('brand')}
          </Link>

          <nav
            aria-label={t('primaryNav.label')}
            className="ml-4 hidden flex-1 items-center gap-1 md:flex"
          >
            <Link
              href="/recherche"
              className="text-fg hover:bg-muted/10 focus-visible:ring-ring rounded-md px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2"
            >
              {t('primaryNav.search')}
            </Link>
            <Link
              href="/destination"
              className="text-fg hover:bg-muted/10 focus-visible:ring-ring rounded-md px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2"
            >
              {t('primaryNav.destinations')}
            </Link>
          </nav>

          <div className="ml-auto flex items-center gap-1">
            {/*
              The switcher reads `useSearchParams()` (preserves the
              query string on `/recherche` etc.), which forces a CSR
              bailout inside statically prerendered pages — wrap it in
              `Suspense` so the rest of the header can prerender.
            */}
            <Suspense fallback={null}>
              <LocaleSwitcher />
            </Suspense>

            <AuthArea variant="header" />

            <MobileNav />
          </div>
        </div>
      </header>
    </>
  );
}
