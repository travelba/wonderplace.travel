import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

export default function NotFound() {
  const t = useTranslations('errors');
  return (
    <main className="container mx-auto flex min-h-[50vh] max-w-prose flex-col items-start justify-center gap-4 px-4 py-16">
      <p className="text-xs uppercase tracking-[0.18em] text-muted">404</p>
      <h1 className="font-serif text-4xl text-fg">{t('notFoundTitle')}</h1>
      <p className="text-muted">{t('notFoundDescription')}</p>
      <Link
        href="/"
        className="mt-4 inline-flex items-center gap-2 rounded-md border border-border bg-bg px-4 py-2 text-sm hover:bg-muted/10"
      >
        ←&nbsp;Retour à l'accueil
      </Link>
    </main>
  );
}
