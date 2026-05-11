import { getTranslations } from 'next-intl/server';

interface HotelFactSheetProps {
  readonly locale: 'fr' | 'en';
  readonly hotelName: string;
  readonly address: string | null;
  readonly postalCode: string | null;
  readonly city: string;
  readonly district: string | null;
  readonly stars: 1 | 2 | 3 | 4 | 5;
  readonly isPalace: boolean;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly totalRooms: number | null;
  readonly suites: number | null;
  readonly checkInFrom: string | null;
  readonly checkOutUntil: string | null;
  readonly petsAllowed: boolean | null;
  readonly lastUpdatedLabel: string | null;
}

/**
 * Compact factual block rendered between the H1 and the AEO answer
 * (CDC §2.3 — "Résumé factuel IA-ready").
 *
 * Design intent
 * -------------
 * LLM ingestion pipelines (Perplexity, SearchGPT, Gemini) extract
 * facts more reliably from `<dl>/<dt>/<dd>` tuples than from prose.
 * We surface only **factual, ground-truthable** values here — no
 * adjectives, no marketing. Each row is independently quotable:
 *
 *   "Address: 19 Avenue Kléber, 75116 Paris"
 *   "Rooms: 200 (including 87 suites)"
 *   "Check-in: from 06:00. Check-out: until 22:00"
 *
 * Visibility
 * ----------
 * The block is small (one card, ~120-160 px tall on desktop) so it
 * does not push the gallery or AEO answer below the fold. On mobile
 * it collapses to a single column.
 *
 * Why not JSON-LD instead?
 * ------------------------
 * The JSON-LD `Hotel` node already ships these facts (Phase 10.8),
 * but rich-result data is invisible to humans and only some LLMs
 * crawl it. A visible `<dl>` is the belt-and-braces signal.
 *
 * Why `data-aeo`?
 * ---------------
 * Matches the convention introduced by the existing AEO answer
 * section — gives us a single CSS class to target if we ever want
 * to tighten styling, and a single `[data-aeo]` selector for the
 * GEO / AEO audit grep.
 *
 * Skill: geo-llm-optimization, structured-data-schema-org.
 */
export async function HotelFactSheet({
  locale,
  hotelName,
  address,
  postalCode,
  city,
  district,
  stars,
  isPalace,
  latitude,
  longitude,
  totalRooms,
  suites,
  checkInFrom,
  checkOutUntil,
  petsAllowed,
  lastUpdatedLabel,
}: HotelFactSheetProps): Promise<React.ReactElement | null> {
  const t = await getTranslations({ locale, namespace: 'hotelPage.factSheet' });

  // Build the address line defensively: avoid the "75116 75116 Paris"
  // pattern if the editorial address already contains the postal code.
  const addressLine: string | null =
    address !== null
      ? postalCode !== null && !address.includes(postalCode)
        ? `${address}, ${postalCode} ${city}`
        : address
      : null;

  const categoryLabel: string = isPalace
    ? t('categoryPalace')
    : t('categoryStars', { count: stars });

  const roomsLine: string | null =
    totalRooms !== null
      ? suites !== null && suites > 0
        ? t('roomsWithSuites', { rooms: totalRooms, suites })
        : t('roomsOnly', { rooms: totalRooms })
      : null;

  const checkInLine: string | null =
    checkInFrom !== null && checkOutUntil !== null
      ? t('checkInOut', { in: checkInFrom, out: checkOutUntil })
      : checkInFrom !== null
        ? t('checkInOnly', { in: checkInFrom })
        : checkOutUntil !== null
          ? t('checkOutOnly', { out: checkOutUntil })
          : null;

  const petsLine: string | null =
    petsAllowed === null ? null : petsAllowed ? t('petsYes') : t('petsNo');

  // Format coordinates compactly: keep 4 decimals (~10 m precision —
  // far better than necessary for a hotel street address).
  const geoLine: string | null =
    latitude !== null && longitude !== null
      ? `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
      : null;

  // Build the dl entries. Skip any row whose value is null so the block
  // shrinks gracefully for partial-data legacy hotels.
  const entries: Array<{ key: string; label: string; value: string }> = [];
  if (addressLine !== null) {
    entries.push({ key: 'address', label: t('addressLabel'), value: addressLine });
  }
  if (district !== null && district !== '') {
    entries.push({ key: 'district', label: t('districtLabel'), value: district });
  }
  entries.push({ key: 'category', label: t('categoryLabel'), value: categoryLabel });
  if (roomsLine !== null) {
    entries.push({ key: 'rooms', label: t('roomsLabel'), value: roomsLine });
  }
  if (checkInLine !== null) {
    entries.push({ key: 'checkin', label: t('checkInOutLabel'), value: checkInLine });
  }
  if (petsLine !== null) {
    entries.push({ key: 'pets', label: t('petsLabel'), value: petsLine });
  }
  if (geoLine !== null) {
    entries.push({ key: 'geo', label: t('geoLabel'), value: geoLine });
  }

  // Refuse to render at all if we only have the category line — the
  // block would feel pointlessly noisy.
  if (entries.length < 2) return null;

  return (
    <section
      data-aeo
      data-llm-summary
      aria-labelledby="fact-sheet-title"
      className="border-border bg-bg mb-10 rounded-lg border p-5"
    >
      <h2 id="fact-sheet-title" className="text-fg font-serif text-lg">
        {t('title', { name: hotelName })}
      </h2>
      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        {entries.map((entry) => (
          <div key={entry.key} className="flex flex-col text-sm sm:flex-row sm:gap-2">
            <dt className="text-muted shrink-0 font-medium sm:min-w-[8rem]">{entry.label}</dt>
            <dd className="text-fg">{entry.value}</dd>
          </div>
        ))}
      </dl>
      {lastUpdatedLabel !== null ? (
        <p data-freshness className="text-muted mt-4 text-xs">
          {t('updatedAt', { date: lastUpdatedLabel })}
        </p>
      ) : null}
    </section>
  );
}
