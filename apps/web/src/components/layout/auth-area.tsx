'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState, type ReactElement } from 'react';

import { Link } from '@/i18n/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * `AuthArea` — client island that resolves the Supabase session in the
 * browser and renders either the "My account" link or the sign-in /
 * sign-up pair.
 *
 * **Why a client island, not a Server Component?**
 *  Reading the auth cookie in the shared layout (`getOptionalUser` →
 *  `cookies()`) marks the entire layout tree as dynamic, which forces
 *  every page underneath to opt into `force-dynamic`. By moving the
 *  session lookup to the client, the layout stays static and pages can
 *  freely choose ISR / SSG.
 *
 * **First paint:** we render an opaque placeholder of the correct
 *  width so the layout doesn't shift when the auth state resolves. The
 *  hooks fire on mount and rely on the Supabase browser client's
 *  cookie-backed session (`getSession()`), which is synchronous after
 *  hydration.
 *
 * **Variants:** the same component is used by the desktop header
 *  (`variant="header"`) and the mobile drawer (`variant="mobile"`).
 *
 * Skill: nextjs-app-router (ISR + client islands), responsive-ui-architecture.
 */
type AuthAreaVariant = 'header' | 'mobile';

interface AuthAreaProps {
  readonly variant: AuthAreaVariant;
}

type AuthState = 'loading' | 'signed-in' | 'signed-out';

const HEADER_CONTAINER = 'flex items-center gap-1 md:flex' as const;
const MOBILE_CONTAINER = 'border-border mt-auto flex flex-col gap-2 border-t pt-5' as const;

const HEADER_BUTTON_PRIMARY =
  'bg-fg text-bg focus-visible:ring-ring rounded-md px-3 py-1.5 text-sm font-medium hover:opacity-90 focus-visible:outline-none focus-visible:ring-2';
const HEADER_BUTTON_GHOST =
  'text-fg hover:bg-muted/10 focus-visible:ring-ring rounded-md px-3 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2';
const HEADER_BUTTON_OUTLINE =
  'border-border bg-bg text-fg hover:bg-muted/10 focus-visible:ring-ring rounded-md border px-3 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2';

const MOBILE_BUTTON_PRIMARY =
  'bg-fg text-bg focus-visible:ring-ring rounded-md px-3 py-2 text-center text-sm font-medium hover:opacity-90 focus-visible:outline-none focus-visible:ring-2';
const MOBILE_BUTTON_OUTLINE =
  'border-border bg-bg text-fg hover:bg-muted/10 focus-visible:ring-ring rounded-md border px-3 py-2 text-center text-sm font-medium focus-visible:outline-none focus-visible:ring-2';

export function AuthArea({ variant }: AuthAreaProps): ReactElement {
  const t = useTranslations('header');
  const [state, setState] = useState<AuthState>('loading');

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    try {
      const supabase = getSupabaseBrowserClient();
      void supabase.auth
        .getSession()
        .then(({ data }) => {
          if (cancelled) return;
          setState(data.session !== null ? 'signed-in' : 'signed-out');
        })
        .catch(() => {
          if (!cancelled) setState('signed-out');
        });
      const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
        if (cancelled) return;
        setState(session !== null ? 'signed-in' : 'signed-out');
      });
      unsubscribe = () => sub.subscription.unsubscribe();
    } catch {
      if (!cancelled) setState('signed-out');
    }

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  // Loading placeholder — reserves the same vertical box as the resolved
  // states so the header doesn't shift after hydration. Width is tuned
  // to roughly match the EN/FR sign-in CTAs (≈ 200 px).
  if (state === 'loading') {
    if (variant === 'header') {
      return (
        <div
          aria-hidden
          className="bg-muted/30 hidden h-9 w-[12rem] animate-pulse rounded-md md:block"
        />
      );
    }
    return (
      <div aria-hidden className="border-border mt-auto flex flex-col gap-2 border-t pt-5">
        <div className="bg-muted/30 h-10 animate-pulse rounded-md" />
        <div className="bg-muted/30 h-10 animate-pulse rounded-md" />
      </div>
    );
  }

  const signedIn = state === 'signed-in';

  if (variant === 'header') {
    return (
      <div className={`hidden ${HEADER_CONTAINER}`}>
        {signedIn ? (
          <Link href="/compte" className={HEADER_BUTTON_OUTLINE}>
            {t('account.myAccount')}
          </Link>
        ) : (
          <>
            <Link href="/compte/connexion" className={HEADER_BUTTON_GHOST}>
              {t('account.signIn')}
            </Link>
            <Link href="/compte/inscription" className={HEADER_BUTTON_PRIMARY}>
              {t('account.signUp')}
            </Link>
          </>
        )}
      </div>
    );
  }

  return (
    <div className={MOBILE_CONTAINER}>
      {signedIn ? (
        <Link href="/compte" className={MOBILE_BUTTON_PRIMARY}>
          {t('account.myAccount')}
        </Link>
      ) : (
        <>
          <Link href="/compte/connexion" className={MOBILE_BUTTON_PRIMARY}>
            {t('account.signIn')}
          </Link>
          <Link href="/compte/inscription" className={MOBILE_BUTTON_OUTLINE}>
            {t('account.signUp')}
          </Link>
        </>
      )}
    </div>
  );
}
