import { getTranslations } from 'next-intl/server';
import { Suspense, type ReactElement } from 'react';

import { Link } from '@/i18n/navigation';
import { getOptionalUser } from '@/server/auth/session';

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
 *  - Server Component: resolves the optional user session once and
 *    passes a `signedIn` bool down to the client islands so the auth
 *    area renders without flicker.
 *  - The skip-link is the first focusable element on every page and
 *    jumps to `#main` (set by the locale layout).
 *  - Desktop nav uses `<nav aria-label>` for a discoverable landmark.
 *  - Mobile nav is a focus-trapped overlay (`MobileNav`).
 */
export async function SiteHeader(): Promise<ReactElement> {
  const t = await getTranslations('header');
  const user = await getOptionalUser();
  const signedIn = user !== null;

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

            <div className="hidden items-center gap-1 md:flex">
              {signedIn ? (
                <Link
                  href="/compte"
                  className="border-border bg-bg text-fg hover:bg-muted/10 focus-visible:ring-ring rounded-md border px-3 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2"
                >
                  {t('account.myAccount')}
                </Link>
              ) : (
                <>
                  <Link
                    href="/compte/connexion"
                    className="text-fg hover:bg-muted/10 focus-visible:ring-ring rounded-md px-3 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2"
                  >
                    {t('account.signIn')}
                  </Link>
                  <Link
                    href="/compte/inscription"
                    className="bg-fg text-bg focus-visible:ring-ring rounded-md px-3 py-1.5 text-sm font-medium hover:opacity-90 focus-visible:outline-none focus-visible:ring-2"
                  >
                    {t('account.signUp')}
                  </Link>
                </>
              )}
            </div>

            <MobileNav signedIn={signedIn} />
          </div>
        </div>
      </header>
    </>
  );
}
