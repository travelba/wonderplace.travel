/** Cache + lock keys follow redis-caching / amadeus-gds skills. */

export const amadeusAuthTokenKey = (): string => 'amadeus:auth:token';
export const amadeusAuthLockKey = (): string => 'amadeus:auth:lock';

export function amadeusHotelOffersCacheKey(input: {
  readonly hotelIds: readonly string[];
  readonly checkInDate: string;
  readonly checkOutDate: string;
  readonly adults: number;
  readonly childAges: readonly number[] | undefined;
  readonly currency: string;
}): string {
  const ages = (input.childAges ?? [])
    .slice()
    .sort((a, b) => a - b)
    .join('-');
  const sorted = [...input.hotelIds].sort().join('|');
  return `amadeus:offers:${sorted}:${input.checkInDate}:${input.checkOutDate}:${input.adults}:${ages}:${input.currency}`;
}

export function amadeusOrderStatusCacheKey(orderId: string): string {
  return `amadeus:order:${orderId}`;
}

/**
 * Hotel-sentiment payloads change at most a few times a day (new reviews
 * trickle in) — a long TTL is appropriate. Key normalises hotel id
 * ordering so `[A, B]` and `[B, A]` hit the same slot.
 */
export function amadeusHotelSentimentsCacheKey(hotelIds: readonly string[]): string {
  const sorted = [...hotelIds].sort().join('|');
  return `amadeus:sentiments:${sorted}`;
}
