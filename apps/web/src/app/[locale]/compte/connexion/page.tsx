import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';

import { Link } from '@/i18n/navigation';
import { isRoutingLocale } from '@/i18n/routing';
import { signInAction } from '@/server/auth/actions';
import { getOptionalUser } from '@/server/auth/session';

export const dynamic = 'force-dynamic';

const ERROR_KINDS = new Set([
  'invalid_input',
  'invalid_credentials',
  'rate_limited',
  'email_not_confirmed',
  'session_missing',
  'upstream',
]);

interface ConnexionSearchParams {
  readonly email?: string;
  readonly error?: string;
  readonly pending?: string;
  readonly next?: string;
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
    title: t('meta.signInTitle'),
    description: t('signIn.subtitle'),
    robots: { index: false, follow: false },
  };
}

export default async function ConnexionPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<ConnexionSearchParams>;
}) {
  const [{ locale: raw }, sp] = await Promise.all([params, searchParams]);
  if (!isRoutingLocale(raw)) notFound();
  const locale = raw;
  setRequestLocale(locale);

  const existing = await getOptionalUser();
  if (existing !== null) {
    redirect(locale === 'en' ? '/en/compte' : '/compte');
  }

  const t = await getTranslations('account');
  const emailPrefill = typeof sp.email === 'string' ? sp.email : '';
  const errorKind = typeof sp.error === 'string' && ERROR_KINDS.has(sp.error) ? sp.error : null;
  const pending = sp.pending === '1';
  const nextPath = typeof sp.next === 'string' ? sp.next : '';

  return (
    <main className="container mx-auto max-w-md px-4 py-12 sm:py-16">
      <p className="text-muted mb-2 text-xs uppercase tracking-[0.18em]">{t('signIn.eyebrow')}</p>
      <h1 className="text-fg mb-2 font-serif text-3xl sm:text-4xl">{t('signIn.title')}</h1>
      <p className="text-muted mb-6">{t('signIn.subtitle')}</p>

      {pending ? (
        <p
          role="status"
          className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
        >
          {t('signIn.pendingBanner')}
        </p>
      ) : null}

      {errorKind !== null ? (
        <p
          role="alert"
          className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"
        >
          {t(`errors.${errorKind}`)}
        </p>
      ) : null}

      <form action={signInAction} className="flex flex-col gap-4">
        <input type="hidden" name="locale" value={locale} />
        {nextPath.length > 0 ? <input type="hidden" name="next" value={nextPath} /> : null}

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-fg font-medium">{t('shared.email')}</span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            defaultValue={emailPrefill}
            className="border-border bg-bg text-fg focus-visible:ring-ring rounded-md border px-3 py-2 outline-none focus-visible:ring-2"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-fg font-medium">{t('shared.password')}</span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            minLength={8}
            className="border-border bg-bg text-fg focus-visible:ring-ring rounded-md border px-3 py-2 outline-none focus-visible:ring-2"
          />
        </label>

        <button
          type="submit"
          className="bg-fg text-bg focus-visible:ring-ring rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 focus-visible:outline-none focus-visible:ring-2"
        >
          {t('signIn.submit')}
        </button>
      </form>

      <div className="mt-6 flex flex-col gap-2 text-sm">
        <Link href="/compte/mot-de-passe-oublie" className="text-muted hover:text-fg underline">
          {t('signIn.forgotCta')}
        </Link>
        <Link href="/compte/inscription" className="text-muted hover:text-fg underline">
          {t('signIn.createCta')}
        </Link>
      </div>
    </main>
  );
}
