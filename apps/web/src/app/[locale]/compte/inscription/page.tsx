import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';

import { Link } from '@/i18n/navigation';
import { isRoutingLocale } from '@/i18n/routing';
import { signUpAction } from '@/server/auth/actions';
import { getOptionalUser } from '@/server/auth/session';

export const dynamic = 'force-dynamic';

const ERROR_KINDS = new Set([
  'invalid_input',
  'password_mismatch',
  'email_taken',
  'rate_limited',
  'upstream',
]);

interface InscriptionSearchParams {
  readonly email?: string;
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
    title: t('meta.signUpTitle'),
    description: t('signUp.subtitle'),
    robots: { index: false, follow: false },
  };
}

export default async function InscriptionPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<InscriptionSearchParams>;
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

  return (
    <main className="container mx-auto max-w-md px-4 py-12 sm:py-16">
      <p className="text-muted mb-2 text-xs uppercase tracking-[0.18em]">{t('signUp.eyebrow')}</p>
      <h1 className="text-fg mb-2 font-serif text-3xl sm:text-4xl">{t('signUp.title')}</h1>
      <p className="text-muted mb-6">{t('signUp.subtitle')}</p>

      {errorKind !== null ? (
        <p
          role="alert"
          className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"
        >
          {t(`errors.${errorKind}`)}
        </p>
      ) : null}

      <form action={signUpAction} className="flex flex-col gap-4" noValidate>
        <input type="hidden" name="locale" value={locale} />

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-fg font-medium">{t('shared.displayName')}</span>
          <input
            type="text"
            name="displayName"
            autoComplete="name"
            maxLength={80}
            className="border-border bg-bg text-fg focus-visible:ring-ring rounded-md border px-3 py-2 outline-none focus-visible:ring-2"
          />
        </label>

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

        <label className="text-fg flex items-center gap-2 text-sm">
          <input type="checkbox" name="newsletter" value="on" className="size-4" />
          <span>{t('shared.newsletter')}</span>
        </label>

        <label className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden>
          {t('shared.honeypotLabel')}
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>

        <p className="text-muted text-xs">{t('signUp.disclaimer')}</p>

        <button
          type="submit"
          className="bg-fg text-bg focus-visible:ring-ring rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 focus-visible:outline-none focus-visible:ring-2"
        >
          {t('signUp.submit')}
        </button>
      </form>

      <div className="mt-6 text-sm">
        <Link href="/compte/connexion" className="text-muted hover:text-fg underline">
          {t('signUp.haveAccount')}
        </Link>
      </div>
    </main>
  );
}
