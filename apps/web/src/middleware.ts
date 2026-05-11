import createMiddleware from 'next-intl/middleware';
import { type NextRequest, NextResponse } from 'next/server';
import { routing } from '@/i18n/routing';
import { buildCspHeader, generateNonce, NONCE_HEADER } from '@/lib/security/csp';
import { updateSession } from '@/lib/supabase/middleware';

const intlMiddleware = createMiddleware(routing);

const IS_DEV = process.env['NODE_ENV'] !== 'production';

export async function middleware(request: NextRequest): Promise<NextResponse> {
  // 1. Per-request CSP nonce. We mutate the inbound NextRequest's Headers
  //    object so downstream `headers().get('x-nonce')` calls in RSCs see it.
  //    Next.js' bundled inline scripts also pick this up automatically and
  //    receive the nonce attribute at SSR time.
  const nonce = generateNonce();
  const csp = buildCspHeader({ nonce, isDev: IS_DEV });
  request.headers.set(NONCE_HEADER, nonce);

  // 2. i18n routing (next-intl). Locale detection + cookie + EN/FR redirects.
  const intlResponse = intlMiddleware(request);

  // 3. Supabase session refresh (skill: auth-role-management). Passing the
  //    intl response as carry preserves any rewrite/redirect produced above.
  const finalResponse = await updateSession(request, intlResponse);

  // 4. Security headers on the outbound response. CSP enforces our threat
  //    model (skill: security-engineering). The `x-nonce` echo is exposed so
  //    tests / debug tooling can inspect it; it is *not* a secret.
  finalResponse.headers.set('Content-Security-Policy', csp);
  finalResponse.headers.set(NONCE_HEADER, nonce);

  return finalResponse;
}

export const config = {
  // Run on app routes only — skip static, _next, api/cron (handled separately), well-known.
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|llms.txt|llms-full.txt|.well-known|manifest.webmanifest|monitoring).*)',
  ],
};
