'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition, type ReactElement } from 'react';

import { getSupabaseBrowserClient } from '@/lib/supabase/client';

interface HotelFavoriteButtonProps {
  readonly hotelId: string;
  readonly hotelName: string;
  readonly locale: 'fr' | 'en';
  /** Same-origin path the unauthenticated user is sent back to after signing in. */
  readonly returnPath: string;
}

type ResolvedState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'signed-out' }
  | { readonly kind: 'signed-in'; readonly favorited: boolean };

/**
 * Heart-toggle client island shown in the hotel detail page header
 * (CDC §2.1 — auth-gated wishlist).
 *
 * Why fully client-side
 * ---------------------
 * The hotel detail page is ISR'd (`revalidate = 3600`) and serves the
 * vast majority of traffic anonymously. Reading the user session in a
 * Server Component (`cookies()` → Supabase server client) would flip
 * the entire page to dynamic rendering, blowing away the cache hit
 * rate. We instead mirror the `AuthArea` pattern: the button mounts in
 * a "loading" placeholder of the correct size, resolves the session +
 * favorited row via the Supabase browser client, and only then
 * displays the heart in the right state. RLS policies (own-only
 * select / insert / delete) prevent any cross-account leak.
 *
 * Behaviour
 * ---------
 *  - Unauthenticated click → push to `/compte/connexion?next=...`.
 *  - Authenticated click → optimistic flip + browser-side
 *    INSERT-or-DELETE on `public.user_favorites`. RLS enforces
 *    `user_id = auth.uid()`. On error we revert the flip silently.
 *  - The icon uses inline SVG (no dep), button hits a 44×44 hit-area
 *    (a11y), and the toggle state is exposed via `aria-pressed`.
 *  - Status changes are announced via a polite live region.
 *
 * Skill: accessibility, responsive-ui-architecture, auth-role-management.
 */
export function HotelFavoriteButton({
  hotelId,
  hotelName,
  locale,
  returnPath,
}: HotelFavoriteButtonProps): ReactElement {
  const t = useTranslations('hotelPage.favorites');
  const router = useRouter();
  const [state, setState] = useState<ResolvedState>({ kind: 'loading' });
  const [announcement, setAnnouncement] = useState<'added' | 'removed' | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;

    async function resolveInitial(): Promise<void> {
      try {
        const supabase = getSupabaseBrowserClient();
        const sessionRes = await supabase.auth.getSession();
        if (cancelled) return;
        const session = sessionRes.data.session;
        if (session === null) {
          setState({ kind: 'signed-out' });
          return;
        }
        const { data, error } = await supabase
          .from('user_favorites')
          .select('hotel_id')
          .eq('user_id', session.user.id)
          .eq('hotel_id', hotelId)
          .maybeSingle();
        if (cancelled) return;
        if (error) {
          setState({ kind: 'signed-in', favorited: false });
          return;
        }
        setState({ kind: 'signed-in', favorited: data !== null });
      } catch {
        if (!cancelled) setState({ kind: 'signed-out' });
      }
    }

    void resolveInitial();
    return () => {
      cancelled = true;
    };
  }, [hotelId]);

  const onClick = (): void => {
    if (state.kind === 'loading') return;

    if (state.kind === 'signed-out') {
      const params = new URLSearchParams({ next: returnPath });
      const signInPath =
        locale === 'en'
          ? `/en/compte/connexion?${params.toString()}`
          : `/compte/connexion?${params.toString()}`;
      router.push(signInPath);
      return;
    }

    const wasFavorited = state.favorited;
    const nextFavorited = !wasFavorited;
    // Optimistic flip — revert on error.
    setState({ kind: 'signed-in', favorited: nextFavorited });

    startTransition(() => {
      void (async () => {
        try {
          const supabase = getSupabaseBrowserClient();
          const sessionRes = await supabase.auth.getSession();
          const session = sessionRes.data.session;
          if (session === null) {
            // Session expired mid-flight. Bounce to login.
            setState({ kind: 'signed-out' });
            const params = new URLSearchParams({ next: returnPath });
            router.push(
              locale === 'en'
                ? `/en/compte/connexion?${params.toString()}`
                : `/compte/connexion?${params.toString()}`,
            );
            return;
          }

          if (wasFavorited) {
            const { error } = await supabase
              .from('user_favorites')
              .delete()
              .eq('user_id', session.user.id)
              .eq('hotel_id', hotelId);
            if (error) {
              setState({ kind: 'signed-in', favorited: wasFavorited });
              return;
            }
            setAnnouncement('removed');
          } else {
            const { error } = await supabase
              .from('user_favorites')
              .upsert(
                { user_id: session.user.id, hotel_id: hotelId },
                { onConflict: 'user_id,hotel_id', ignoreDuplicates: true },
              );
            if (error) {
              setState({ kind: 'signed-in', favorited: wasFavorited });
              return;
            }
            setAnnouncement('added');
          }
        } catch {
          setState({ kind: 'signed-in', favorited: wasFavorited });
        }
      })();
    });
  };

  if (state.kind === 'loading') {
    return (
      <div aria-hidden className="bg-muted/30 inline-flex h-11 w-[8rem] animate-pulse rounded-md" />
    );
  }

  const favorited = state.kind === 'signed-in' && state.favorited;
  const labelKey = favorited ? 'removeFromFavorites' : 'addToFavorites';
  const shortKey = favorited ? 'shortRemove' : 'shortAdd';

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        aria-pressed={favorited}
        aria-label={t(labelKey, { name: hotelName })}
        className="border-border bg-bg hover:bg-muted/10 focus-visible:ring-ring inline-flex h-11 min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:cursor-progress disabled:opacity-70"
      >
        <HeartIcon filled={favorited} />
        <span className="hidden sm:inline">{t(shortKey)}</span>
      </button>

      <span aria-live="polite" className="sr-only">
        {announcement === 'added' ? t('confirmAdded', { name: hotelName }) : null}
        {announcement === 'removed' ? t('confirmRemoved', { name: hotelName }) : null}
      </span>
    </>
  );
}

function HeartIcon({ filled }: { readonly filled: boolean }): ReactElement {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.75}
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={filled ? 'text-rose-600' : 'text-fg'}
    >
      <path d="M12 21s-7.5-4.5-9.5-9A5.25 5.25 0 0 1 12 6.75 5.25 5.25 0 0 1 21.5 12c-2 4.5-9.5 9-9.5 9z" />
    </svg>
  );
}
