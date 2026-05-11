import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { ConsentManageLink } from '@/components/consent';
import { isRoutingLocale } from '@/i18n/routing';

import { LegalSection, LegalShell } from '../_components/legal-shell';
import { buildLegalMetadata } from '../_components/legal-metadata';

export const dynamic = 'force-static';

const LAST_UPDATED = '2026-05-01';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildLegalMetadata({
    locale,
    slug: 'cookies',
    translationsNamespace: 'legal.cookiesPage',
  });
}

export default async function CookiesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isRoutingLocale(raw)) notFound();
  setRequestLocale(raw);

  const t = await getTranslations('legal.cookiesPage');

  return (
    <LegalShell locale={raw} title={t('title')} lastUpdatedIso={LAST_UPDATED}>
      <LegalSection title={t('sections.intro.title')}>
        <p>{t('sections.intro.body')}</p>
      </LegalSection>

      <LegalSection title={t('sections.categories.title')}>
        <p>{t('sections.categories.intro')}</p>
        <ul className="mt-3 list-disc pl-5">
          <li>{t('sections.categories.essential')}</li>
          <li>{t('sections.categories.analytics')}</li>
        </ul>
      </LegalSection>

      <LegalSection title={t('sections.manage.title')}>
        <p>{t('sections.manage.body')}</p>
        <p className="mt-4">
          <ConsentManageLink variant="button" />
        </p>
      </LegalSection>

      <LegalSection title={t('sections.contact.title')}>
        <p>{t('sections.contact.body')}</p>
      </LegalSection>
    </LegalShell>
  );
}
