import { getTranslations } from 'next-intl/server';

import type {
  LocalisedLocation,
  LocalisedPointOfInterest,
  LocalisedTransport,
  TransportMode,
} from '@/server/hotels/get-hotel-by-slug';

import { HotelStaticMap } from './hotel-static-map';

interface HotelLocationProps {
  readonly locale: 'fr' | 'en';
  readonly hotelName: string;
  readonly city: string;
  readonly address: string | null;
  readonly postalCode: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly location: LocalisedLocation;
}

const TRANSPORT_MODE_ORDER: readonly TransportMode[] = [
  'metro',
  'rer',
  'tram',
  'bus',
  'train',
  'taxi',
  'airport_shuttle',
];

/**
 * Sort POIs ascending by walking distance — closest landmarks first
 * (matches what travel guides do and what users skim from the top).
 */
function sortPois(pois: readonly LocalisedPointOfInterest[]): readonly LocalisedPointOfInterest[] {
  return [...pois].sort((a, b) => a.distanceMeters - b.distanceMeters);
}

/**
 * Sort transports first by mode (metro → ... → shuttle), then by distance.
 * Keeps the metro/RER (the most actionable info for Paris hotels) on top.
 */
function sortTransports(transports: readonly LocalisedTransport[]): readonly LocalisedTransport[] {
  return [...transports].sort((a, b) => {
    const ai = TRANSPORT_MODE_ORDER.indexOf(a.mode);
    const bi = TRANSPORT_MODE_ORDER.indexOf(b.mode);
    if (ai !== bi) return ai - bi;
    return a.distanceMeters - b.distanceMeters;
  });
}

/**
 * Location section for the hotel detail page — CDC §2 bloc 10.
 *
 * Surfaces:
 *   - The textual address (when available) and a map link.
 *   - A list of points of interest sorted by walking distance.
 *   - A list of transport stations grouped by mode (metro first).
 *
 * Pure RSC. The caller decides whether to render the section
 * (typically: only when at least one POI or transport entry is present).
 */
export async function HotelLocation({
  locale,
  hotelName,
  city,
  address,
  postalCode,
  latitude,
  longitude,
  location,
}: HotelLocationProps): Promise<React.ReactElement | null> {
  const hasPois = location.pointsOfInterest.length > 0;
  const hasTransports = location.transports.length > 0;
  if (!hasPois && !hasTransports && address === null) return null;

  const t = await getTranslations({ locale, namespace: 'hotelPage' });

  // Build the canonical address string. When `postalCode` is provided and
  // the street already includes the city, we preserve as-is to avoid the
  // dreaded "75116 75116 Paris" duplication. Otherwise we append a clean
  // `postalCode city` tail.
  const addressLine: string | null =
    address !== null
      ? postalCode !== null && !address.includes(postalCode)
        ? `${address}, ${postalCode} ${city}`
        : address
      : null;

  const mapHref =
    latitude !== null && longitude !== null
      ? `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}&zoom=15`
      : null;

  const pois = sortPois(location.pointsOfInterest);
  const transports = sortTransports(location.transports);

  return (
    <section aria-labelledby="location-title" className="mb-12">
      <h2 id="location-title" className="text-fg mb-3 font-serif text-2xl">
        {t('sections.location')}
      </h2>

      {addressLine !== null ? (
        <p className="text-fg text-sm">
          <span className="text-muted">{t('location.addressLabel')}</span> {addressLine}
        </p>
      ) : (
        <p className="text-fg text-sm">
          <span className="text-muted">{t('location.cityLabel')}</span> {city}
        </p>
      )}

      {latitude !== null && longitude !== null ? (
        <HotelStaticMap
          locale={locale}
          hotelName={hotelName}
          latitude={latitude}
          longitude={longitude}
        />
      ) : null}

      {mapHref !== null ? (
        <p className="mt-3 text-sm">
          <a
            href={mapHref}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted hover:text-fg underline"
            aria-label={t('location.mapAria', { hotelName })}
          >
            {t('location.viewMap')}
          </a>
        </p>
      ) : null}

      {hasPois ? (
        <div className="mt-6">
          <h3 className="text-fg mb-2 font-medium">{t('location.poisTitle')}</h3>
          <ul className="divide-border flex flex-col divide-y">
            {pois.map((poi) => (
              <li
                key={`${poi.name}-${poi.distanceMeters}`}
                className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm"
              >
                <div className="flex flex-col">
                  <span className="text-fg">{poi.name}</span>
                  {poi.category !== null ? (
                    <span className="text-muted text-xs">{poi.category}</span>
                  ) : null}
                </div>
                <span className="text-muted text-xs tabular-nums">
                  {t('location.distanceMeters', { meters: poi.distanceMeters })}
                  {poi.walkMinutes !== null
                    ? ` · ${t('location.walkMinutes', { count: poi.walkMinutes })}`
                    : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {hasTransports ? (
        <div className="mt-6">
          <h3 className="text-fg mb-2 font-medium">{t('location.transportsTitle')}</h3>
          <ul className="divide-border flex flex-col divide-y">
            {transports.map((tr) => (
              <li
                key={`${tr.mode}-${tr.line ?? ''}-${tr.station}`}
                className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm"
              >
                <div className="flex flex-col">
                  <span className="text-fg">
                    <span className="text-muted text-xs uppercase tracking-wider">
                      {t(`location.transportMode.${tr.mode}`)}
                      {tr.line !== null ? ` ${tr.line}` : ''}
                    </span>{' '}
                    {tr.station}
                  </span>
                  {tr.notes !== null ? (
                    <span className="text-muted text-xs">{tr.notes}</span>
                  ) : null}
                </div>
                <span className="text-muted text-xs tabular-nums">
                  {t('location.distanceMeters', { meters: tr.distanceMeters })}
                  {tr.walkMinutes !== null
                    ? ` · ${t('location.walkMinutes', { count: tr.walkMinutes })}`
                    : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
