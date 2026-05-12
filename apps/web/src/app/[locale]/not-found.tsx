import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

export default function NotFound() {
  const t = useTranslations('errors');
  return (
    <main className="container mx-auto flex min-h-[50vh] max-w-prose flex-col items-start justify-center gap-4 px-4 py-16">
      <p className="text-muted text-xs uppercase tracking-[0.18em]">404</p>
      <h1 className="text-fg font-serif text-4xl">{t('notFoundTitle')}</h1>
      <p className="text-muted">{t('notFoundDescription')}</p>
      <Link
        href="/"
        className="border-border bg-bg hover:bg-muted/10 mt-4 inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm"
      >
        ←&nbsp;Retour à l'accueil
      </Link>
    </main>
  );
}
