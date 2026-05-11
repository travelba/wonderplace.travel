import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { isRoutingLocale } from '@/i18n/routing';

import { LegalSection, LegalShell } from '../_components/legal-shell';
import { buildLegalMetadata } from '../_components/legal-metadata';

// Legal pages rarely change and have no per-request state — SSG.
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
    slug: 'mentions-legales',
    translationsNamespace: 'legal.noticePage',
  });
}

export default async function LegalNoticePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isRoutingLocale(raw)) notFound();
  setRequestLocale(raw);

  const t = await getTranslations('legal.noticePage');

  return (
    <LegalShell locale={raw} title={t('title')} lastUpdatedIso={LAST_UPDATED}>
      <LegalSection title={t('sections.editor.title')}>
        <p>{t('sections.editor.body')}</p>
      </LegalSection>
      <LegalSection title={t('sections.contact.title')}>
        <p>{t('sections.contact.body')}</p>
      </LegalSection>
      <LegalSection title={t('sections.hosting.title')}>
        <p>{t('sections.hosting.body')}</p>
      </LegalSection>
      <LegalSection title={t('sections.license.title')}>
        <p>{t('sections.license.body')}</p>
      </LegalSection>
      <LegalSection title={t('sections.ip.title')}>
        <p>{t('sections.ip.body')}</p>
      </LegalSection>
    </LegalShell>
  );
}
