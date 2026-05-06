import createMiddleware from 'next-intl/middleware';
import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { routing } from '@/i18n/routing';

const intlMiddleware = createMiddleware(routing);

export async function middleware(request: NextRequest): Promise<NextResponse> {
  // i18n middleware sets locale + cookie + redirects EN/FR.
  const intlResponse = intlMiddleware(request);

  // Refresh Supabase auth cookies on every navigation (skill: auth-role-management).
  const authResponse = await updateSession(request, intlResponse);
  return authResponse;
}

export const config = {
  // Run on app routes only — skip static, _next, api/cron (handled separately), well-known.
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|llms.txt|llms-full.txt|.well-known|manifest.webmanifest|monitoring).*)',
  ],
};
