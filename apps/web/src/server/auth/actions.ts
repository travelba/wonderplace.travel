'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Supported account locales. Mirrors `next-intl` routing.
 */
const AccountLocaleSchema = z.enum(['fr', 'en']);
type AccountLocale = z.infer<typeof AccountLocaleSchema>;

const SignInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  locale: AccountLocaleSchema,
  next: z.string().startsWith('/').max(256).optional(),
});

const SignUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  confirmPassword: z.string().min(8).max(128),
  displayName: z.string().trim().min(1).max(80).optional(),
  newsletter: z.union([z.literal('on'), z.literal('off')]).optional(),
  honeypot: z.string().max(0).optional(),
  locale: AccountLocaleSchema,
});

const ForgotSchema = z.object({
  email: z.string().email(),
  locale: AccountLocaleSchema,
});

const ResetSchema = z.object({
  password: z.string().min(8).max(128),
  confirmPassword: z.string().min(8).max(128),
  locale: AccountLocaleSchema,
});

const SignOutSchema = z.object({
  locale: AccountLocaleSchema,
});

type AuthErrorKind =
  | 'invalid_input'
  | 'invalid_credentials'
  | 'password_mismatch'
  | 'email_taken'
  | 'email_not_confirmed'
  | 'rate_limited'
  | 'upstream'
  | 'session_missing';

function accountPath(locale: AccountLocale, sub: string): string {
  return locale === 'en' ? `/en/compte${sub}` : `/compte${sub}`;
}

function originFromHeaders(headerList: Headers): string {
  const explicitOrigin = headerList.get('origin');
  if (explicitOrigin !== null && explicitOrigin.length > 0) return explicitOrigin;
  const proto = headerList.get('x-forwarded-proto') ?? 'https';
  const host = headerList.get('x-forwarded-host') ?? headerList.get('host');
  if (typeof host === 'string' && host.length > 0) return `${proto}://${host}`;
  return 'http://localhost:3000';
}

function readField(form: FormData, key: string): string | undefined {
  const v = form.get(key);
  return typeof v === 'string' ? v : undefined;
}

function buildErrorRedirect(
  locale: AccountLocale,
  sub: string,
  kind: AuthErrorKind,
  email?: string,
): string {
  const params = new URLSearchParams();
  params.set('error', kind);
  if (typeof email === 'string' && email.length > 0) params.set('email', email);
  return `${accountPath(locale, sub)}?${params.toString()}`;
}

function safeNext(locale: AccountLocale, candidate: string | undefined): string {
  if (typeof candidate !== 'string') return accountPath(locale, '');
  if (!candidate.startsWith('/')) return accountPath(locale, '');
  if (candidate.startsWith('//')) return accountPath(locale, '');
  return candidate;
}

/* -------------------------------------------------------------------------- */
/* Sign-in                                                                    */
/* -------------------------------------------------------------------------- */

export async function signInAction(formData: FormData): Promise<void> {
  const parsed = SignInSchema.safeParse({
    email: readField(formData, 'email'),
    password: readField(formData, 'password'),
    locale: readField(formData, 'locale'),
    next: readField(formData, 'next'),
  });
  if (!parsed.success) {
    const email = readField(formData, 'email');
    const locale = (readField(formData, 'locale') as AccountLocale | undefined) ?? 'fr';
    redirect(buildErrorRedirect(locale, '/connexion', 'invalid_input', email));
  }

  const { email, password, locale, next } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error !== null) {
    const code = error.code ?? '';
    const kind: AuthErrorKind =
      code === 'invalid_credentials'
        ? 'invalid_credentials'
        : code === 'email_not_confirmed'
          ? 'email_not_confirmed'
          : error.status === 429
            ? 'rate_limited'
            : 'upstream';
    redirect(buildErrorRedirect(locale, '/connexion', kind, email));
  }

  redirect(safeNext(locale, next));
}

/* -------------------------------------------------------------------------- */
/* Sign-up                                                                    */
/* -------------------------------------------------------------------------- */

export async function signUpAction(formData: FormData): Promise<void> {
  const parsed = SignUpSchema.safeParse({
    email: readField(formData, 'email'),
    password: readField(formData, 'password'),
    confirmPassword: readField(formData, 'confirmPassword'),
    displayName: readField(formData, 'displayName'),
    newsletter: readField(formData, 'newsletter'),
    honeypot: readField(formData, 'website'),
    locale: readField(formData, 'locale'),
  });
  if (!parsed.success) {
    const email = readField(formData, 'email');
    const locale = (readField(formData, 'locale') as AccountLocale | undefined) ?? 'fr';
    redirect(buildErrorRedirect(locale, '/inscription', 'invalid_input', email));
  }

  const { email, password, confirmPassword, displayName, newsletter, locale } = parsed.data;
  if (password !== confirmPassword) {
    redirect(buildErrorRedirect(locale, '/inscription', 'password_mismatch', email));
  }

  const headerList = await headers();
  const origin = originFromHeaders(headerList);
  const callbackUrl = `${origin}${locale === 'en' ? '/en' : ''}/auth/callback?next=${encodeURIComponent(accountPath(locale, ''))}`;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: callbackUrl,
      data: {
        display_name: displayName ?? null,
        locale_pref: locale,
        newsletter_opt_in: newsletter === 'on',
      },
    },
  });

  if (error !== null) {
    const code = error.code ?? '';
    const kind: AuthErrorKind =
      code === 'user_already_exists' || code === 'email_address_invalid'
        ? 'email_taken'
        : error.status === 429
          ? 'rate_limited'
          : 'upstream';
    redirect(buildErrorRedirect(locale, '/inscription', kind, email));
  }

  // Email confirmation required: send the user to a confirmation-pending page
  // (reuses the sign-in screen with a banner).
  redirect(`${accountPath(locale, '/connexion')}?pending=1`);
}

/* -------------------------------------------------------------------------- */
/* Sign-out                                                                   */
/* -------------------------------------------------------------------------- */

export async function signOutAction(formData: FormData): Promise<void> {
  const parsed = SignOutSchema.safeParse({ locale: readField(formData, 'locale') });
  const locale: AccountLocale = parsed.success ? parsed.data.locale : 'fr';

  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect(accountPath(locale, '/connexion'));
}

/* -------------------------------------------------------------------------- */
/* Forgot password                                                            */
/* -------------------------------------------------------------------------- */

export async function forgotPasswordAction(formData: FormData): Promise<void> {
  const parsed = ForgotSchema.safeParse({
    email: readField(formData, 'email'),
    locale: readField(formData, 'locale'),
  });
  if (!parsed.success) {
    const email = readField(formData, 'email');
    const locale = (readField(formData, 'locale') as AccountLocale | undefined) ?? 'fr';
    redirect(buildErrorRedirect(locale, '/mot-de-passe-oublie', 'invalid_input', email));
  }

  const { email, locale } = parsed.data;
  const headerList = await headers();
  const origin = originFromHeaders(headerList);
  const redirectTo = `${origin}${locale === 'en' ? '/en' : ''}/auth/callback?next=${encodeURIComponent(accountPath(locale, '/nouveau-mot-de-passe'))}`;

  const supabase = await createSupabaseServerClient();
  // Always redirect to the "check your inbox" screen — we never reveal whether
  // the email is registered (anti-enumeration). Errors are logged server-side.
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error !== null && process.env['NODE_ENV'] !== 'production') {
    console.warn('[forgotPasswordAction] reset email error', error.message);
  }
  redirect(`${accountPath(locale, '/mot-de-passe-oublie')}?sent=1`);
}

/* -------------------------------------------------------------------------- */
/* Reset password (after recovery callback opened a session)                  */
/* -------------------------------------------------------------------------- */

export async function resetPasswordAction(formData: FormData): Promise<void> {
  const parsed = ResetSchema.safeParse({
    password: readField(formData, 'password'),
    confirmPassword: readField(formData, 'confirmPassword'),
    locale: readField(formData, 'locale'),
  });
  if (!parsed.success) {
    const locale = (readField(formData, 'locale') as AccountLocale | undefined) ?? 'fr';
    redirect(buildErrorRedirect(locale, '/nouveau-mot-de-passe', 'invalid_input'));
  }

  const { password, confirmPassword, locale } = parsed.data;
  if (password !== confirmPassword) {
    redirect(buildErrorRedirect(locale, '/nouveau-mot-de-passe', 'password_mismatch'));
  }

  const supabase = await createSupabaseServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) {
    redirect(buildErrorRedirect(locale, '/connexion', 'session_missing'));
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error !== null) {
    const kind: AuthErrorKind = error.status === 429 ? 'rate_limited' : 'upstream';
    redirect(buildErrorRedirect(locale, '/nouveau-mot-de-passe', kind));
  }

  redirect(`${accountPath(locale, '')}?reset=1`);
}
