import { getTranslations } from 'next-intl/server';
import type { ReactElement } from 'react';

import { ConsentManageLink } from '@/components/consent';
import { Link } from '@/i18n/navigation';

/**
 * Site-wide footer (skill: responsive-ui-architecture).
 *
 * Three navigation columns + a fourth utility row carrying the
 * "Manage cookies" button and copyright. Renders as a Server Component
 * because every link is locale-aware (`@/i18n/navigation`) and content
 * comes from `next-intl/server`.
 *
 * Legal links land on the FR slugs in both locales — same convention
 * as the rest of the site. Locale-specific slug mapping is deferred to
 * a future `pathnames` migration.
 */
export async function SiteFooter(): Promise<ReactElement> {
  const t = await getTranslations('footer');
  const year = new Date().getFullYear();

  return (
    <footer className="border-border bg-bg mt-16 border-t">
      <div className="container mx-auto max-w-screen-xl px-4 py-10 sm:py-12">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          <div className="md:col-span-1">
            <p className="text-fg font-serif text-lg">{t('company')}</p>
            <p className="text-muted mt-2 text-sm">{t('tagline')}</p>
          </div>

          <nav aria-label={t('headings.explore')}>
            <h2 className="text-muted mb-3 text-xs font-medium uppercase tracking-wider">
              {t('headings.explore')}
            </h2>
            <ul className="flex flex-col gap-2 text-sm">
              <li>
                <Link href="/recherche" className="text-fg hover:underline">
                  {t('links.search')}
                </Link>
              </li>
              <li>
                <Link href="/destination" className="text-fg hover:underline">
                  {t('links.destinations')}
                </Link>
              </li>
            </ul>
          </nav>

          <nav aria-label={t('headings.info')}>
            <h2 className="text-muted mb-3 text-xs font-medium uppercase tracking-wider">
              {t('headings.info')}
            </h2>
            <ul className="flex flex-col gap-2 text-sm">
              <li>
                <Link href="/compte" className="text-fg hover:underline">
                  {t('links.account')}
                </Link>
              </li>
            </ul>
          </nav>

          <nav aria-label={t('headings.legal')}>
            <h2 className="text-muted mb-3 text-xs font-medium uppercase tracking-wider">
              {t('headings.legal')}
            </h2>
            <ul className="flex flex-col gap-2 text-sm">
              <li>
                <Link href="/mentions-legales" className="text-fg hover:underline">
                  {t('links.legalNotice')}
                </Link>
              </li>
              <li>
                <Link href="/confidentialite" className="text-fg hover:underline">
                  {t('links.privacy')}
                </Link>
              </li>
              <li>
                <Link href="/cgv" className="text-fg hover:underline">
                  {t('links.terms')}
                </Link>
              </li>
              <li>
                <Link href="/cookies" className="text-fg hover:underline">
                  {t('links.cookies')}
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        <div className="border-border text-muted mt-10 flex flex-col gap-3 border-t pt-6 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>{t('rights', { year })}</p>
          <ConsentManageLink />
        </div>
      </div>
    </footer>
  );
}
