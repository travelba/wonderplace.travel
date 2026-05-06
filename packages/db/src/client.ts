/**
 * Server-only Supabase admin client (service role).
 * Never importable from client components — guarded by a `server-only` import.
 */
import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type SupabaseAdminClient = SupabaseClient;

interface AdminClientConfig {
  readonly url: string;
  readonly serviceRoleKey: string;
}

export const createSupabaseAdminClient = ({
  url,
  serviceRoleKey,
}: AdminClientConfig): SupabaseAdminClient =>
  createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        'x-cct-source': 'admin-server',
      },
    },
  });
