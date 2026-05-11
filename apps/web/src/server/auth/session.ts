import 'server-only';

import type { User } from '@supabase/supabase-js';

import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Returns the current Supabase user if one is signed in, else `null`.
 *
 * Tolerant of missing env vars: at build time (CI smoke build without
 * secrets) the Supabase client cannot be constructed. We coerce that
 * failure to `null` so layouts that depend on the session (e.g. the
 * site header) can prerender as "anonymous" instead of crashing.
 */
export async function getOptionalUser(): Promise<User | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    return data.user ?? null;
  } catch {
    return null;
  }
}

/**
 * Guarded session reader for protected server contexts. Caller is responsible
 * for redirecting to the sign-in page when this returns `null` — we don't
 * call `redirect()` here so this helper stays composable inside layouts that
 * may have their own auth handling.
 */
export async function getRequiredUser(): Promise<User | null> {
  return getOptionalUser();
}

/** Convenience: pick a display name from auth metadata, with sensible fallbacks. */
export function pickDisplayName(user: User): string {
  const meta = user.user_metadata as Record<string, unknown> | null | undefined;
  if (meta !== null && meta !== undefined) {
    const dn = meta['display_name'];
    if (typeof dn === 'string' && dn.trim().length > 0) return dn.trim();
    const fn = meta['first_name'];
    if (typeof fn === 'string' && fn.trim().length > 0) return fn.trim();
  }
  const email = user.email;
  if (typeof email === 'string' && email.length > 0) return email.split('@')[0] ?? email;
  return 'voyageur';
}
