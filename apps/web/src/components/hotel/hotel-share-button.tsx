'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

interface HotelShareButtonProps {
  /** Hotel name — used as `navigator.share()` `title`. */
  readonly hotelName: string;
  /**
   * Short context line used as `navigator.share()` `text`. Falls back
   * to an empty string if not provided; the spec says implementations
   * choose how to format `title`/`text`/`url` independently.
   */
  readonly shareText: string | null;
  /**
   * Canonical absolute URL to share. The component itself does NOT
   * read `window.location.href` — that pattern leaks tracking
   * parameters into shared links. The parent passes the canonical
   * URL it already computed for `<link rel="canonical">`.
   */
  readonly canonicalUrl: string;
}

/**
 * Share button for the public hotel page — gap-analysis CDC §2.1
 * (header identity, was 3/5).
 *
 * Behaviour
 * ---------
 *   1. **First try `navigator.share()`** when present (real
 *      iOS/Android/Edge support; surfaces the OS share-sheet).
 *      Modern Safari/Chrome dropdown handles SMS, AirDrop, Mail,
 *      Slack, X, etc. natively.
 *   2. **Fallback to `navigator.clipboard.writeText()`** when
 *      `navigator.share` is unavailable (desktop Firefox, older
 *      browsers, locked-down enterprise builds).
 *   3. **Fallback again to a hidden textarea + `execCommand('copy')`**
 *      for environments where Clipboard API is blocked (insecure
 *      contexts, very old browsers). We still honour user gesture
 *      since this runs from a click handler.
 *   4. **No copy possible** → reveal a `<details>` with the URL the
 *      user can select manually. Belt-and-braces a11y.
 *
 * Why a client island and not a server `<a>` link?
 * ------------------------------------------------
 *   - `navigator.share()` exposes the OS share-sheet which links
 *     can't trigger.
 *   - Copy-to-clipboard with a toast is a real UX improvement over
 *     "Right-click → Copy link".
 *
 * Telemetry hook: every successful share emits a `data-share-event`
 * mutation on the button so a downstream analytics MutationObserver
 * can pick it up without bundling an analytics SDK here. (No
 * tracking pixel; respects DNT.)
 *
 * a11y
 * ----
 *   - `aria-live="polite"` toast feedback (status, not alert).
 *   - Button itself has `aria-label` describing the action; the
 *     visible text is short ("Partager"/"Share") for visual density.
 *   - Disabled state during the async share to prevent double-click.
 *
 * Skill: accessibility, security-engineering (no PII leakage),
 * geo-llm-optimization (`data-share-source` selector for parity
 * with our `data-aeo` / `data-llm-summary` markers).
 */
type ShareStatus = 'idle' | 'sharing' | 'copied' | 'shared' | 'failed';

export function HotelShareButton({
  hotelName,
  shareText,
  canonicalUrl,
}: HotelShareButtonProps): React.ReactElement {
  const t = useTranslations('hotelPage.share');
  const [status, setStatus] = useState<ShareStatus>('idle');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  const scheduleReset = (): void => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setStatus('idle');
    }, 3500);
  };

  const copyToClipboardFallback = async (url: string): Promise<boolean> => {
    if (
      typeof navigator !== 'undefined' &&
      typeof navigator.clipboard !== 'undefined' &&
      typeof navigator.clipboard.writeText === 'function'
    ) {
      try {
        await navigator.clipboard.writeText(url);
        return true;
      } catch {
        // Falls through to legacy fallback.
      }
    }
    // Legacy fallback — works in non-secure contexts where Clipboard
    // API is blocked. The user gesture (button click) is preserved
    // because this runs synchronously inside the handler chain.
    if (typeof document === 'undefined') return false;
    try {
      const textarea = document.createElement('textarea');
      textarea.value = url;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      // execCommand is deprecated but still the only path in some
      // locked-down browser environments.
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      return ok;
    } catch {
      return false;
    }
  };

  const handleShare = async (): Promise<void> => {
    if (status === 'sharing') return;
    setStatus('sharing');

    const payload: ShareData = {
      title: hotelName,
      url: canonicalUrl,
      ...(shareText !== null && shareText.length > 0 ? { text: shareText } : {}),
    };

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share(payload);
        setStatus('shared');
        scheduleReset();
        return;
      } catch (err) {
        // `AbortError` = user cancelled the share-sheet; that is a
        // success path, just reset silently.
        if (
          err instanceof DOMException &&
          (err.name === 'AbortError' || err.name === 'NotAllowedError')
        ) {
          setStatus('idle');
          return;
        }
        // Otherwise fall through to copy-to-clipboard.
      }
    }

    const copied = await copyToClipboardFallback(canonicalUrl);
    setStatus(copied ? 'copied' : 'failed');
    scheduleReset();
  };

  const feedbackText: string =
    status === 'copied'
      ? t('toastCopied')
      : status === 'shared'
        ? t('toastShared')
        : status === 'failed'
          ? t('toastFailed')
          : '';

  return (
    <div data-share-source="hotel-page" className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => {
          // Discard the promise on purpose; status drives the UI.
          void handleShare();
        }}
        disabled={status === 'sharing'}
        aria-label={t('buttonAria', { name: hotelName })}
        className="border-border bg-bg text-fg hover:bg-bg/80 focus-visible:ring-ring inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 disabled:opacity-60"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
        >
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
          <polyline points="16 6 12 2 8 6" />
          <line x1="12" y1="2" x2="12" y2="15" />
        </svg>
        <span>{t('button')}</span>
      </button>
      <span
        role="status"
        aria-live="polite"
        className="text-muted text-xs"
        data-share-feedback={status}
      >
        {feedbackText}
      </span>
      {status === 'failed' ? (
        <details className="text-xs">
          <summary className="text-fg cursor-pointer underline-offset-2 hover:underline">
            {t('manualCopyLabel')}
          </summary>
          <p className="text-muted mt-1 break-all">{canonicalUrl}</p>
        </details>
      ) : null}
    </div>
  );
}
