import 'server-only';

import { cookies } from 'next/headers';

const COOKIE_NAME = 'cct.bk_draft';
const MAX_AGE_FALLBACK_SEC = 30 * 60;
const MIN_AGE_SEC = 30;
const MAX_AGE_CAP_SEC = 60 * 60;

const isProd = (): boolean => process.env['NODE_ENV'] === 'production';

/**
 * Stores the draft id in a hardened cookie. We deliberately don't sign it:
 * lookup requires a corresponding Redis entry whose key is the random
 * draft id (UUID v4, 122 bits of entropy). Guessing a valid id within
 * the offer TTL is computationally infeasible.
 */
export async function setDraftCookie(draftId: string, ttlSec: number): Promise<void> {
  const maxAge = Math.min(
    MAX_AGE_CAP_SEC,
    Math.max(MIN_AGE_SEC, Math.floor(ttlSec || MAX_AGE_FALLBACK_SEC)),
  );
  const store = await cookies();
  store.set(COOKIE_NAME, draftId, {
    httpOnly: true,
    secure: isProd(),
    sameSite: 'lax',
    path: '/',
    maxAge,
  });
}

export async function getDraftId(): Promise<string | undefined> {
  const store = await cookies();
  const value = store.get(COOKIE_NAME)?.value;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export async function clearDraftCookie(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
