import { createServerClient, type SetAllCookies } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';

/**
 * Refreshes Supabase auth cookies on every request and forwards them onto the
 * outgoing response. Composed inside `middleware.ts` after next-intl.
 *
 * In CI smoke builds and preview environments that run with
 * `SKIP_ENV_VALIDATION=true`, the Supabase env vars may be undefined.
 * In that case we degrade gracefully: the request is forwarded with no
 * auth refresh and downstream `getOptionalUser()` returns `null`.
 */
export async function updateSession(
  request: NextRequest,
  carry?: NextResponse,
): Promise<NextResponse> {
  let response = carry ?? NextResponse.next({ request });

  let supabaseUrl: string | undefined;
  let supabaseAnonKey: string | undefined;
  try {
    supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
    supabaseAnonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  } catch {
    return response;
  }
  if (!supabaseUrl || !supabaseAnonKey) return response;

  let supabase;
  try {
    supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = carry ?? NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    });
  } catch {
    return response;
  }

  try {
    // Trigger token refresh.
    await supabase.auth.getUser();
  } catch {
    // Network blip / SDK failure — return the carry response untouched.
  }
  return response;
}
