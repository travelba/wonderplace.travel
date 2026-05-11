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
    slug: 'confidentialite',
    translationsNamespace: 'legal.privacyPage',
  });
}

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isRoutingLocale(raw)) notFound();
  setRequestLocale(raw);

  const t = await getTranslations('legal.privacyPage');

  const purposes = t.raw('sections.purposes.items') as readonly string[];
  const retention = t.raw('sections.retention.items') as readonly string[];

  return (
    <LegalShell locale={raw} title={t('title')} lastUpdatedIso={LAST_UPDATED}>
      <LegalSection title={t('sections.intro.title')}>
        <p>{t('sections.intro.body')}</p>
      </LegalSection>
      <LegalSection title={t('sections.controller.title')}>
        <p>{t('sections.controller.body')}</p>
      </LegalSection>
      <LegalSection title={t('sections.purposes.title')}>
        <ul className="list-disc pl-5">
          {purposes.map((item, idx) => (
            <li key={idx}>{item}</li>
          ))}
        </ul>
      </LegalSection>
      <LegalSection title={t('sections.retention.title')}>
        <ul className="list-disc pl-5">
          {retention.map((item, idx) => (
            <li key={idx}>{item}</li>
          ))}
        </ul>
      </LegalSection>
      <LegalSection title={t('sections.recipients.title')}>
        <p>{t('sections.recipients.body')}</p>
      </LegalSection>
      <LegalSection title={t('sections.transfers.title')}>
        <p>{t('sections.transfers.body')}</p>
      </LegalSection>
      <LegalSection title={t('sections.rights.title')}>
        <p>{t('sections.rights.body')}</p>
      </LegalSection>
      <LegalSection title={t('sections.cookies.title')}>
        <p>{t('sections.cookies.body')}</p>
      </LegalSection>
    </LegalShell>
  );
}
