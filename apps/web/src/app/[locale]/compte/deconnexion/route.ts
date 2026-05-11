import { NextResponse, type NextRequest } from 'next/server';

import { isRoutingLocale } from '@/i18n/routing';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * POST-only sign-out. GET would be CSRF-vulnerable so we 405 it.
 * Always redirects to the sign-in page — never reveals whether a session existed.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ locale: string }> },
): Promise<NextResponse> {
  const { locale: raw } = await params;
  const locale = isRoutingLocale(raw) ? raw : 'fr';
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();

  const destination = locale === 'en' ? '/en/compte/connexion' : '/compte/connexion';
  return NextResponse.redirect(new URL(destination, request.url), { status: 303 });
}

export function GET(): NextResponse {
  return new NextResponse('Method Not Allowed', {
    status: 405,
    headers: { Allow: 'POST' },
  });
}
