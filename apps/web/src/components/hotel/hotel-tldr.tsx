import type { ReactElement } from 'react';

interface HotelTldrProps {
  readonly locale: 'fr' | 'en';
  readonly name: string;
  readonly city: string;
  readonly region: string;
  readonly isPalace: boolean;
  readonly totalRooms: number | null;
  readonly suites: number | null;
  readonly openedYear: number | null;
  readonly architects: readonly string[];
  /** Booking mode — drives the contextual CTA hint. */
  readonly bookingMode: 'amadeus' | 'little' | 'email' | 'display_only';
  /** ISO `YYYY-MM-DD` of last meaningful content update — freshness signal. */
  readonly dateModified: string | null;
}

const T = {
  fr: {
    eyebrow: 'Réponse rapide',
    palaceLine: 'distingué Palace par Atout France',
    fiveStarLine: '5 étoiles',
    inCity: (city: string, region: string) => ` à ${city} (${region})`,
    inventory: (rooms: number, suites: number) =>
      suites > 0 ? `${rooms} chambres dont ${suites} suites` : `${rooms} chambres`,
    openedSince: (year: number) => `Ouvert depuis ${year}`,
    bookingAmadeus: 'Réservation immédiate au tarif négocié via notre conciergerie agréée IATA.',
    bookingLittle: 'Réservation directe au tarif officiel, sans commission cachée.',
    bookingEmail: 'Réservation sur demande personnalisée par notre conciergerie.',
    bookingDisplay: 'Fiche éditoriale — réservation par contact direct avec l’hôtel.',
    architecte: (names: readonly string[]) =>
      names.length === 1 ? `Conçu par ${names[0]}.` : `Conçu par ${names.slice(0, 2).join(' & ')}.`,
    updatedAt: (date: string) => `Mis à jour le ${date}.`,
  },
  en: {
    eyebrow: 'Quick answer',
    palaceLine: 'distinguished as a Palace by Atout France',
    fiveStarLine: '5-star',
    inCity: (city: string, region: string) => ` in ${city} (${region})`,
    inventory: (rooms: number, suites: number) =>
      suites > 0 ? `${rooms} rooms including ${suites} suites` : `${rooms} rooms`,
    openedSince: (year: number) => `Open since ${year}`,
    bookingAmadeus:
      'Instant booking at the negotiated rate via our IATA-accredited concierge desk.',
    bookingLittle: 'Direct booking at the official rate, no hidden commission.',
    bookingEmail: 'Bespoke request handled by our concierge desk.',
    bookingDisplay: 'Editorial page — booking via direct contact with the hotel.',
    architecte: (names: readonly string[]) =>
      names.length === 1
        ? `Designed by ${names[0]}.`
        : `Designed by ${names.slice(0, 2).join(' & ')}.`,
    updatedAt: (date: string) => `Updated on ${date}.`,
  },
} as const;

function formatDateForLocale(iso: string, locale: 'fr' | 'en'): string | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  try {
    return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return null;
  }
}

/**
 * AEO "Quick answer" / TL;DR block (skill: geo-llm-optimization §AEO).
 *
 * Sits at the top of the fiche, immediately after the hero header.
 * Carries the 4-6 facts that LLM ingestion pipelines (Perplexity,
 * SearchGPT, AI Overviews) need to answer the most common queries:
 *
 *   - "Tell me about <hotel>"     → first sentence + status (Palace/5★)
 *   - "Where is <hotel>?"         → city + region
 *   - "How many rooms?"           → inventory line
 *   - "When was it built?"        → opened year + architect
 *   - "How do I book <hotel>?"    → booking-mode-aware CTA hint
 *   - Freshness signal            → dateModified line
 *
 * Stable id `#tldr` — referenced by the Hotel JSON-LD
 * `speakable.cssSelector` so Google Assistant picks up THIS block
 * (rather than a random paragraph) for voice answers.
 *
 * The wrapper is `<aside>` (not `<section>`) so search engines treat
 * it as a complementary summary, not as a duplicate of the main
 * `<h1>` heading. The visible style is a soft amber-tinted card,
 * compact (≤ 4 lines on desktop, ≤ 6 on mobile) so it never pushes
 * the hero gallery below the fold.
 */
export function HotelTldr({
  locale,
  name,
  city,
  region,
  isPalace,
  totalRooms,
  suites,
  openedYear,
  architects,
  bookingMode,
  dateModified,
}: HotelTldrProps): ReactElement {
  const t = T[locale];

  // First sentence — status + location + name.
  const statusFragment = isPalace ? t.palaceLine : t.fiveStarLine;
  const firstSentence = `${name} est un hôtel ${statusFragment}${t.inCity(city, region)}.`;
  const firstSentenceEn = `${name} is a${statusFragment === t.palaceLine ? ' hotel ' : ' '}${statusFragment}${t.inCity(city, region)}.`;

  // Inventory line (only when known — never bluff).
  const inventoryLine =
    totalRooms !== null && totalRooms > 0 ? t.inventory(totalRooms, suites ?? 0) : null;

  // Opened/architect — facts only, no fluff.
  const openedLine = openedYear !== null ? t.openedSince(openedYear) : null;
  const architectLine = architects.length > 0 ? t.architecte(architects) : null;

  // Booking CTA hint.
  const bookingLine =
    bookingMode === 'amadeus'
      ? t.bookingAmadeus
      : bookingMode === 'little'
        ? t.bookingLittle
        : bookingMode === 'email'
          ? t.bookingEmail
          : t.bookingDisplay;

  const formattedDate = dateModified !== null ? formatDateForLocale(dateModified, locale) : null;

  return (
    <aside
      id="tldr"
      aria-label={t.eyebrow}
      className="mb-10 rounded-xl border border-amber-200 bg-amber-50/50 p-5 md:p-6"
    >
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-800">
        {t.eyebrow}
      </p>
      <p className="text-fg text-base leading-relaxed md:text-lg">
        {locale === 'fr' ? firstSentence : firstSentenceEn}
        {inventoryLine !== null ? ' ' + inventoryLine + '.' : ''}
      </p>
      {openedLine !== null || architectLine !== null || bookingLine.length > 0 ? (
        <ul className="text-muted mt-3 space-y-1 text-sm md:text-base">
          {openedLine !== null ? <li>• {openedLine}.</li> : null}
          {architectLine !== null ? <li>• {architectLine}</li> : null}
          <li>• {bookingLine}</li>
        </ul>
      ) : null}
      {formattedDate !== null ? (
        <p className="text-muted/80 mt-3 text-xs">{t.updatedAt(formattedDate)}</p>
      ) : null}
    </aside>
  );
}
