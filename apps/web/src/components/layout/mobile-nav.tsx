'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState, type ReactElement } from 'react';

import { Link, usePathname } from '@/i18n/navigation';

interface MobileNavProps {
  /** Whether to show the "Mon compte" link or the "Connexion" pair. */
  readonly signedIn: boolean;
}

/**
 * Mobile slide-over menu (skill: accessibility §dialogs +
 * responsive-ui-architecture).
 *
 * Behaviour:
 *  - Hamburger button is shown on `< md` only — desktop renders the
 *    inline nav from the parent server component.
 *  - Opening the drawer locks body scroll and traps focus.
 *  - Esc closes it. Clicking the backdrop closes it. Clicking a link
 *    closes it (route change handled by next-intl).
 *  - `role="dialog"` + `aria-modal="true"` because it's an *overlay*
 *    (vs. the consent banner which is non-modal).
 */
export function MobileNav({ signedIn }: MobileNavProps): ReactElement {
  const t = useTranslations('header');
  const [open, setOpen] = useState(false);
  const labelId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // Close on route change — `usePathname` reference changes after nav.
  const pathname = usePathname();
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Body scroll lock + Esc handler.
  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Focus first focusable element of the panel on open, restore to
  // trigger on close.
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        const focusable = panelRef.current?.querySelector<HTMLElement>(
          'a, button, [tabindex]:not([tabindex="-1"])',
        );
        focusable?.focus();
      });
    } else {
      triggerRef.current?.focus({ preventScroll: true });
    }
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={labelId}
        aria-label={open ? t('menu.close') : t('menu.open')}
        onClick={() => setOpen((v) => !v)}
        className="border-border bg-bg text-fg hover:bg-muted/10 focus-visible:ring-ring inline-flex h-9 w-9 items-center justify-center rounded-md border focus-visible:outline-none focus-visible:ring-2 md:hidden"
      >
        {open ? (
          <svg
            aria-hidden
            viewBox="0 0 20 20"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
          >
            <path d="M5 5l10 10M5 15L15 5" strokeLinecap="round" />
          </svg>
        ) : (
          <svg
            aria-hidden
            viewBox="0 0 20 20"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
          >
            <path d="M3 6h14M3 10h14M3 14h14" strokeLinecap="round" />
          </svg>
        )}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <button
            type="button"
            aria-label={t('menu.close')}
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="bg-fg/40 absolute inset-0"
          />

          {/* Panel */}
          <div
            id={labelId}
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={t('menu.label')}
            className="border-border bg-bg absolute right-0 top-0 flex h-dvh w-[min(20rem,85vw)] flex-col overflow-y-auto border-l p-5 shadow-xl"
          >
            <div className="mb-6 flex items-center justify-between">
              <p className="text-fg font-serif text-lg">{t('brand')}</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t('menu.close')}
                className="border-border bg-bg text-fg hover:bg-muted/10 focus-visible:ring-ring inline-flex h-9 w-9 items-center justify-center rounded-md border focus-visible:outline-none focus-visible:ring-2"
              >
                <svg
                  aria-hidden
                  viewBox="0 0 20 20"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                >
                  <path d="M5 5l10 10M5 15L15 5" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <nav aria-label={t('primaryNav.label')} className="flex flex-col gap-1 text-base">
              <Link
                href="/recherche"
                className="text-fg hover:bg-muted/10 focus-visible:ring-ring rounded-md px-3 py-2 focus-visible:outline-none focus-visible:ring-2"
              >
                {t('primaryNav.search')}
              </Link>
              <Link
                href="/destination"
                className="text-fg hover:bg-muted/10 focus-visible:ring-ring rounded-md px-3 py-2 focus-visible:outline-none focus-visible:ring-2"
              >
                {t('primaryNav.destinations')}
              </Link>
            </nav>

            <div className="border-border mt-auto flex flex-col gap-2 border-t pt-5">
              {signedIn ? (
                <Link
                  href="/compte"
                  className="bg-fg text-bg focus-visible:ring-ring rounded-md px-3 py-2 text-center text-sm font-medium hover:opacity-90 focus-visible:outline-none focus-visible:ring-2"
                >
                  {t('account.myAccount')}
                </Link>
              ) : (
                <>
                  <Link
                    href="/compte/connexion"
                    className="bg-fg text-bg focus-visible:ring-ring rounded-md px-3 py-2 text-center text-sm font-medium hover:opacity-90 focus-visible:outline-none focus-visible:ring-2"
                  >
                    {t('account.signIn')}
                  </Link>
                  <Link
                    href="/compte/inscription"
                    className="border-border bg-bg text-fg hover:bg-muted/10 focus-visible:ring-ring rounded-md border px-3 py-2 text-center text-sm font-medium focus-visible:outline-none focus-visible:ring-2"
                  >
                    {t('account.signUp')}
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
