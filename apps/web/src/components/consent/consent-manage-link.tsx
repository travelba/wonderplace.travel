'use client';

import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

import { openConsentBanner } from '@/lib/consent/client';

/**
 * "Manage cookies" button — renders as plain text so it sits cleanly
 * inside footer nav columns or inline body copy. Triggers a custom event
 * picked up by `<ConsentBanner />` to re-open the dialog.
 */
export function ConsentManageLink(props: {
  readonly className?: string;
  readonly variant?: 'inline' | 'button';
}): ReactElement {
  const t = useTranslations('consent');
  const className =
    props.variant === 'button'
      ? 'inline-flex items-center rounded-md border border-border bg-bg px-3 py-1.5 text-sm font-medium text-fg hover:bg-muted/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      : (props.className ??
        'text-sm text-muted underline-offset-4 hover:text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring');
  return (
    <button type="button" onClick={() => openConsentBanner()} className={className}>
      {t('footerLink')}
    </button>
  );
}
