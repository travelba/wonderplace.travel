import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';

import { isRoutingLocale } from '@/i18n/routing';
import { resetPasswordAction } from '@/server/auth/actions';
import { getOptionalUser } from '@/server/auth/session';

export const dynamic = 'force-dynamic';

const ERROR_KINDS = new Set([
  'invalid_input',
  'password_mismatch',
  'rate_limited',
  'upstream',
  'session_missing',
]);

interface ResetSearchParams {
  readonly error?: string;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: raw } = await params;
  if (!isRoutingLocale(raw)) return {};
  const t = await getTranslations({ locale: raw, namespace: 'account' });
  return {
    title: t('meta.resetTitle'),
    description: t('reset.subtitle'),
    robots: { index: false, follow: false },
  };
}

export default async function NewPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<ResetSearchParams>;
}) {
  const [{ locale: raw }, sp] = await Promise.all([params, searchParams]);
  if (!isRoutingLocale(raw)) notFound();
  const locale = raw;
  setRequestLocale(locale);

  // Recovery flow must reach this page with a Supabase session set by the
  // `/auth/callback` handler. Without one, push back to sign-in.
  const user = await getOptionalUser();
  if (user === null) {
    redirect(
      (locale === 'en' ? '/en/compte/connexion' : '/compte/connexion') + '?error=session_missing',
    );
  }

  const t = await getTranslations('account');
  const errorKind = typeof sp.error === 'string' && ERROR_KINDS.has(sp.error) ? sp.error : null;

  return (
    <main className="container mx-auto max-w-md px-4 py-12 sm:py-16">
      <p className="text-muted mb-2 text-xs uppercase tracking-[0.18em]">{t('reset.eyebrow')}</p>
      <h1 className="text-fg mb-2 font-serif text-3xl sm:text-4xl">{t('reset.title')}</h1>
      <p className="text-muted mb-6">{t('reset.subtitle')}</p>

      {errorKind !== null ? (
        <p
          role="alert"
          className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"
        >
          {t(`errors.${errorKind}`)}
        </p>
      ) : null}

      <form action={resetPasswordAction} className="flex flex-col gap-4">
        <input type="hidden" name="locale" value={locale} />

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-fg font-medium">{t('shared.password')}</span>
          <input
            type="password"
            name="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={128}
            className="border-border bg-bg text-fg focus-visible:ring-ring rounded-md border px-3 py-2 outline-none focus-visible:ring-2"
          />
          <span className="text-muted text-xs">{t('shared.passwordHint')}</span>
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-fg font-medium">{t('shared.confirmPassword')}</span>
          <input
            type="password"
            name="confirmPassword"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={128}
            className="border-border bg-bg text-fg focus-visible:ring-ring rounded-md border px-3 py-2 outline-none focus-visible:ring-2"
          />
        </label>

        <button
          type="submit"
          className="bg-fg text-bg focus-visible:ring-ring rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 focus-visible:outline-none focus-visible:ring-2"
        >
          {t('reset.submit')}
        </button>
      </form>
    </main>
  );
}
