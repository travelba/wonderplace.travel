import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

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
    slug: 'cgv',
    translationsNamespace: 'legal.termsPage',
  });
}

export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isRoutingLocale(raw)) notFound();
  setRequestLocale(raw);

  const t = await getTranslations('legal.termsPage');

  return (
    <LegalShell locale={raw} title={t('title')} lastUpdatedIso={LAST_UPDATED}>
      <LegalSection title={t('sections.scope.title')}>
        <p>{t('sections.scope.body')}</p>
      </LegalSection>
      <LegalSection title={t('sections.reservation.title')}>
        <p>{t('sections.reservation.body')}</p>
      </LegalSection>
      <LegalSection title={t('sections.price.title')}>
        <p>{t('sections.price.body')}</p>
      </LegalSection>
      <LegalSection title={t('sections.cancellation.title')}>
        <p>{t('sections.cancellation.body')}</p>
      </LegalSection>
      <LegalSection title={t('sections.liability.title')}>
        <p>{t('sections.liability.body')}</p>
      </LegalSection>
      <LegalSection title={t('sections.loyalty.title')}>
        <p>{t('sections.loyalty.body')}</p>
      </LegalSection>
      <LegalSection title={t('sections.law.title')}>
        <p>{t('sections.law.body')}</p>
      </LegalSection>
    </LegalShell>
  );
}
