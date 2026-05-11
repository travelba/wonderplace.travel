import { getTranslations } from 'next-intl/server';
import type { ReactElement, ReactNode } from 'react';

import type { Locale } from '@/i18n/routing';

interface LegalShellProps {
  readonly locale: Locale;
  readonly title: string;
  /** ISO date of last edition (YYYY-MM-DD) — surfaced for trust + AEO. */
  readonly lastUpdatedIso: string;
  readonly children: ReactNode;
}

/**
 * Common shell for the four legal pages — title, "last updated" line,
 * generous prose width, semantic landmarks. Kept intentionally minimal
 * so each page can drop its content in.
 */
export async function LegalShell({
  locale,
  title,
  lastUpdatedIso,
  children,
}: LegalShellProps): Promise<ReactElement> {
  const t = await getTranslations('legal');
  const formatted = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', {
    dateStyle: 'long',
  }).format(new Date(lastUpdatedIso));

  return (
    <main className="container mx-auto max-w-prose px-4 py-10 sm:py-14">
      <header className="border-border mb-8 border-b pb-6">
        <h1 className="text-fg font-serif text-3xl sm:text-4xl">{title}</h1>
        <p className="text-muted mt-2 text-xs">{t('lastUpdated', { date: formatted })}</p>
      </header>
      <article className="text-fg/90 flex flex-col gap-8 text-base">{children}</article>
    </main>
  );
}

interface LegalSectionProps {
  readonly title: string;
  readonly children: ReactNode;
}

export function LegalSection({ title, children }: LegalSectionProps): ReactElement {
  return (
    <section aria-label={title}>
      <h2 className="text-fg mb-3 font-serif text-xl sm:text-2xl">{title}</h2>
      <div className="prose prose-sm max-w-none leading-relaxed">{children}</div>
    </section>
  );
}
