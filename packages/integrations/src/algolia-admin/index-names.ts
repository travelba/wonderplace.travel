export type SearchLocale = 'fr' | 'en';

export function hotelsIndexName(prefix: string, locale: SearchLocale): string {
  return `${prefix}hotels_${locale}`;
}

export function citiesIndexName(prefix: string, locale: SearchLocale): string {
  return `${prefix}cities_${locale}`;
}
