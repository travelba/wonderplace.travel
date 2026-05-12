'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, useTransition, type ReactElement } from 'react';

import { getSupabaseBrowserClient } from '@/lib/supabase/client';

interface FavoriteRemoveButtonProps {
  readonly hotelId: string;
  readonly hotelName: string;
}

/**
 * Compact "remove from favorites" client island used on `/compte/favoris`
 * cards.
 *
 * Why a dedicated component (vs. reusing `<HotelFavoriteButton>`)
 * ----------------------------------------------------------------
 * The hotel-page heart toggle does double duty (add / remove) and
 * resolves the initial state by querying `user_favorites` on mount. On
 * this listing page the favorite is already known to exist (we got
 * here through `listUserFavorites()`), so the round-trip would be
 * wasted work. We also want a different visual: a small ✕ icon button
 * tucked into the card corner rather than a labelled heart button.
 *
 * Behaviour
 * ---------
 *   - Optimistic flip: the row is hidden client-side immediately
 *     (parent re-render after `router.refresh()`), and reverts only
 *     if the Supabase delete fails.
 *   - RLS policy `user_favorites_delete_own` enforces own-only on the
 *     DB side — no service role needed.
 *   - `router.refresh()` re-runs the parent Server Component so the
 *     server view of the list is consistent with the optimistic flip
 *     and other tabs/devices get the updated count on next navigation.
 *
 * Accessibility (skill: accessibility)
 * ------------------------------------
 *   - Real `<button>` with descriptive `aria-label` interpolating the
 *     hotel name ("Retirer Hôtel X de mes favoris").
 *   - 32×32 hit-area + visible focus ring.
 *   - Status announced via a polite `aria-live` SR-only region after
 *     a successful removal.
 */
export function FavoriteRemoveButton({
  hotelId,
  hotelName,
}: FavoriteRemoveButtonProps): ReactElement {
  const t = useTranslations('account.favorites');
  const router = useRouter();
  const [removed, setRemoved] = useState<boolean>(false);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onClick = (): void => {
    if (removed || isPending) return;
    // Optimistic hide — the parent will fully drop the card after
    // router.refresh() returns fresh server data. We only reset
    // `removed` to false on error.
    setRemoved(true);
    startTransition(() => {
      void (async () => {
        try {
          const supabase = getSupabaseBrowserClient();
          const sessionRes = await supabase.auth.getSession();
          const session = sessionRes.data.session;
          if (session === null) {
            // Session expired mid-flight — revert and let the page
            // reload to bounce through the auth redirect.
            setRemoved(false);
            router.refresh();
            return;
          }
          const { error } = await supabase
            .from('user_favorites')
            .delete()
            .eq('user_id', session.user.id)
            .eq('hotel_id', hotelId);
          if (error !== null) {
            setRemoved(false);
            return;
          }
          setAnnouncement(t('removeConfirmation', { name: hotelName }));
          router.refresh();
        } catch {
          setRemoved(false);
        }
      })();
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={removed || isPending}
        aria-label={t('removeAction', { name: hotelName })}
        className="border-border/60 bg-bg/90 hover:bg-bg focus-visible:ring-ring text-fg absolute right-2 top-2 z-10 inline-flex h-8 min-h-[32px] w-8 min-w-[32px] items-center justify-center rounded-full border shadow-sm backdrop-blur-sm transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:cursor-progress disabled:opacity-60"
      >
        <CloseIcon />
      </button>
      <span aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </>
  );
}

function CloseIcon(): ReactElement {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M6 6l12 12M18 6l-12 12" />
    </svg>
  );
}
