import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';

/**
 * Refreshes Supabase auth cookies on every request and forwards them onto the
 * outgoing response. Composed inside `middleware.ts` after next-intl.
 */
export async function updateSession(
  request: NextRequest,
  carry?: NextResponse,
): Promise<NextResponse> {
  let response = carry ?? NextResponse.next({ request });

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = carry ?? NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Trigger token refresh.
  await supabase.auth.getUser();
  return response;
}
