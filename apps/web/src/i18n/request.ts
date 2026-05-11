import { getRequestConfig } from 'next-intl/server';
import { resolveLocale } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = resolveLocale(requested);

  const messages = (await import(`./messages/${locale}.json`)).default as Record<string, string>;

  return {
    locale,
    messages,
    timeZone: 'Europe/Paris',
    now: new Date(),
  };
});
