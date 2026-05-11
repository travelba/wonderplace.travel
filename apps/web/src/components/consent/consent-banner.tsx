'use client';

import { useEffect, useId, useRef, useState, type ReactElement } from 'react';
import { useTranslations } from 'next-intl';

import { acceptAll, customize, rejectAll, type ConsentState } from '@cct/domain/consent';

import { onConsentReopen, readConsentClient, writeConsentClient } from '@/lib/consent/client';

type ViewState = 'closed' | 'summary' | 'customize';

/**
 * GDPR/CNIL cookie consent banner (skill: security-engineering §GDPR +
 * accessibility §dialogs).
 *
 * Lifecycle:
 *  - On mount, read the cookie. If a decision exists → stay closed.
 *  - Otherwise → open in `summary` view with three primary actions.
 *  - User can drill into `customize` view to toggle categories.
 *  - Any explicit choice (Accept all / Reject all / Save) writes the
 *    cookie and closes the banner.
 *  - The footer "Manage cookies" link fires `cct:consent-reopen` →
 *    re-opens in `summary` view.
 *
 * Accessibility:
 *  - Rendered as a `role="dialog"` with `aria-modal="false"` (non-blocking
 *    banner per CNIL — does not steal focus from page content).
 *  - Initial focus moved to the first action when opened.
 *  - Escape closes the banner ONLY when a decision has already been made
 *    (otherwise the user must explicitly accept or refuse).
 */
export function ConsentBanner(): ReactElement | null {
  const t = useTranslations('consent');
  const titleId = useId();
  const introId = useId();

  const [view, setView] = useState<ViewState>('closed');
  const [analyticsChecked, setAnalyticsChecked] = useState<boolean>(true);
  const firstActionRef = useRef<HTMLButtonElement | null>(null);
  const decisionRef = useRef<boolean>(false);

  useEffect(() => {
    // Decide initial visibility from the persisted cookie.
    const current = readConsentClient();
    decisionRef.current = current !== null;
    if (current === null) {
      setView('summary');
    } else {
      setAnalyticsChecked(current.analytics);
    }

    const off = onConsentReopen(() => {
      setView('summary');
      const fresh = readConsentClient();
      setAnalyticsChecked(fresh?.analytics ?? true);
    });
    return off;
  }, []);

  useEffect(() => {
    if (view !== 'closed') {
      // Defer to give the layout a frame to mount before stealing focus.
      requestAnimationFrame(() => firstActionRef.current?.focus());
    }
  }, [view]);

  useEffect(() => {
    if (view === 'closed') return undefined;
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key !== 'Escape') return;
      if (!decisionRef.current) return; // first visit must choose
      setView('closed');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view]);

  const persist = (state: ConsentState): void => {
    writeConsentClient(state);
    decisionRef.current = true;
    setAnalyticsChecked(state.analytics);
    setView('closed');
  };

  const handleAcceptAll = (): void => persist(acceptAll());
  const handleRejectAll = (): void => persist(rejectAll());
  const handleSave = (): void => persist(customize({ analytics: analyticsChecked }));

  if (view === 'closed') return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      aria-describedby={introId}
      aria-label={t('dialog.label')}
      className="border-border bg-bg/95 fixed inset-x-0 bottom-0 z-50 border-t shadow-[0_-4px_24px_rgba(0,0,0,0.06)] backdrop-blur"
    >
      <div className="container mx-auto flex max-w-screen-xl flex-col gap-4 px-4 py-5 sm:py-6 md:flex-row md:items-start md:gap-6">
        <div className="flex-1">
          <h2 id={titleId} className="text-fg font-serif text-base sm:text-lg">
            {t('title')}
          </h2>
          <p id={introId} className="text-muted mt-2 text-sm">
            {t('intro')}
          </p>

          {view === 'customize' ? (
            <fieldset
              aria-labelledby={`${titleId}-categories`}
              className="border-border mt-4 flex flex-col gap-3 border-t pt-4"
            >
              <legend id={`${titleId}-categories`} className="sr-only">
                {t('summaryLabel')}
              </legend>

              <div className="flex items-start gap-3">
                <input
                  id={`${titleId}-essential`}
                  type="checkbox"
                  checked
                  disabled
                  aria-describedby={`${titleId}-essential-desc`}
                  className="mt-1 h-4 w-4 cursor-not-allowed"
                />
                <div>
                  <label htmlFor={`${titleId}-essential`} className="text-fg text-sm font-medium">
                    {t('categories.essential.name')}
                  </label>
                  <p id={`${titleId}-essential-desc`} className="text-muted text-xs">
                    {t('categories.essential.description')}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <input
                  id={`${titleId}-analytics`}
                  type="checkbox"
                  checked={analyticsChecked}
                  aria-describedby={`${titleId}-analytics-desc`}
                  onChange={(e) => setAnalyticsChecked(e.target.checked)}
                  className="mt-1 h-4 w-4 cursor-pointer"
                />
                <div>
                  <label htmlFor={`${titleId}-analytics`} className="text-fg text-sm font-medium">
                    {t('categories.analytics.name')}
                  </label>
                  <p id={`${titleId}-analytics-desc`} className="text-muted text-xs">
                    {t('categories.analytics.description')}
                  </p>
                </div>
              </div>
            </fieldset>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap md:min-w-[200px] md:flex-col">
          {view === 'summary' ? (
            <>
              <button
                ref={firstActionRef}
                type="button"
                onClick={handleAcceptAll}
                className="bg-fg text-bg focus-visible:ring-ring rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 focus-visible:outline-none focus-visible:ring-2"
              >
                {t('actions.acceptAll')}
              </button>
              <button
                type="button"
                onClick={handleRejectAll}
                className="border-border bg-bg text-fg hover:bg-muted/10 focus-visible:ring-ring rounded-md border px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2"
              >
                {t('actions.rejectAll')}
              </button>
              <button
                type="button"
                onClick={() => setView('customize')}
                className="text-fg focus-visible:ring-ring rounded-md border border-transparent px-4 py-2 text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2"
              >
                {t('actions.customize')}
              </button>
            </>
          ) : (
            <>
              <button
                ref={firstActionRef}
                type="button"
                onClick={handleSave}
                className="bg-fg text-bg focus-visible:ring-ring rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 focus-visible:outline-none focus-visible:ring-2"
              >
                {t('actions.savePreferences')}
              </button>
              <button
                type="button"
                onClick={() => setView('summary')}
                className="border-border bg-bg text-fg hover:bg-muted/10 focus-visible:ring-ring rounded-md border px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2"
              >
                {t('actions.back')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
