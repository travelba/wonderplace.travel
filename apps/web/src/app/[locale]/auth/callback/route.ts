import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { isRoutingLocale } from '@/i18n/routing';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const OtpTypeSchema = z.enum([
  'signup',
  'email',
  'magiclink',
  'recovery',
  'invite',
  'email_change',
]);

function accountPath(locale: 'fr' | 'en', sub: string): string {
  return locale === 'en' ? `/en/compte${sub}` : `/compte${sub}`;
}

function safeNext(url: URL, locale: 'fr' | 'en', candidate: string | null): string {
  if (candidate === null) return accountPath(locale, '');
  if (!candidate.startsWith('/')) return accountPath(locale, '');
  if (candidate.startsWith('//')) return accountPath(locale, '');
  return new URL(candidate, url).pathname + new URL(candidate, url).search;
}

/**
 * Verifies Supabase email-confirm / recovery tokens, sets the cookie session,
 * then forwards to the in-app destination.
 *
 * Supabase sends `?token_hash=...&type=signup|recovery|...` (PKCE-less default).
 * Older flows may use `?code=...` — handle both.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ locale: string }> },
): Promise<NextResponse> {
  const { locale: raw } = await params;
  const locale: 'fr' | 'en' = isRoutingLocale(raw) ? raw : 'fr';
  const url = new URL(request.url);

  const tokenHash = url.searchParams.get('token_hash');
  const rawType = url.searchParams.get('type');
  const code = url.searchParams.get('code');
  const nextRaw = url.searchParams.get('next');

  const supabase = await createSupabaseServerClient();

  // Branch A: token_hash + type (default email confirm flow).
  if (tokenHash !== null && rawType !== null) {
    const typeParsed = OtpTypeSchema.safeParse(rawType);
    if (!typeParsed.success) {
      return NextResponse.redirect(
        new URL(accountPath(locale, '/connexion') + '?error=upstream', url),
        303,
      );
    }
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: typeParsed.data,
    });
    if (error !== null) {
      return NextResponse.redirect(
        new URL(accountPath(locale, '/connexion') + '?error=upstream', url),
        303,
      );
    }
    const destination =
      typeParsed.data === 'recovery'
        ? accountPath(locale, '/nouveau-mot-de-passe')
        : safeNext(url, locale, nextRaw);
    return NextResponse.redirect(new URL(destination, url), 303);
  }

  // Branch B: legacy/PKCE `?code=...` exchange.
  if (code !== null) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error !== null) {
      return NextResponse.redirect(
        new URL(accountPath(locale, '/connexion') + '?error=upstream', url),
        303,
      );
    }
    return NextResponse.redirect(new URL(safeNext(url, locale, nextRaw), url), 303);
  }

  return NextResponse.redirect(
    new URL(accountPath(locale, '/connexion') + '?error=invalid_input', url),
    303,
  );
}
