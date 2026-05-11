import 'server-only';

import { createSupabaseAdminClient, type SupabaseAdminClient } from '@cct/db';

import { env } from '@/lib/env';

let cached: SupabaseAdminClient | undefined;

/**
 * Service-role Supabase client. Bypasses RLS — use ONLY in trusted server
 * code that validates its own inputs (e.g. server actions submitting an
 * anonymous booking request). Never expose this to client components or
 * shared utilities that could end up bundled into the browser.
 */
export function getSupabaseAdminClient(): SupabaseAdminClient {
  if (cached) return cached;
  cached = createSupabaseAdminClient({
    url: env.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  });
  return cached;
}
