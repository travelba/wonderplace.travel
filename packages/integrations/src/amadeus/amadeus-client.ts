import { loadSharedEnv, type SharedEnv } from '@cct/config/env';
import type { CancellationPolicy, Offer } from '@cct/domain/booking';
import { err, ok, type Result } from '@cct/domain/shared';

import { retryingJsonRequest } from '../http/index.js';
import { getRedis } from '../redis/index.js';
import { redisGetString, redisSetStringWithTtl } from '../redis/cache-helpers.js';

import { amadeusHotelOffersCacheKey, amadeusHotelSentimentsCacheKey } from './cache-keys.js';
import type { AmadeusError } from './errors.js';
import { amadeusOfferToDomain } from './map-offer.js';
import { getAmadeusAccessToken, type AmadeusOAuthConfig } from './oauth-token.js';
import {
  HotelOffersInputSchema,
  HotelOffersResponseSchema,
  HotelOrderCreateInputSchema,
  HotelOrderResponseSchema,
  HotelSentimentsInputSchema,
  HotelSentimentsResponseSchema,
  HotelsByCityResponseSchema,
  OfferDetailInputSchema,
  OfferDetailResponseSchema,
  SearchHotelsByCityInputSchema,
  type HotelOffersInput,
  type HotelOffersResponse,
  type HotelOrderCreateInput,
  type HotelOrderResponse,
  type HotelSentimentsInput,
  type HotelSentimentsResponse,
  type HotelsByCityResponse,
  type SearchHotelsByCityInput,
} from './types.js';

const HOTEL_OFFERS_TTL_SEC = 15 * 60;
const HOTELS_BY_CITY_TTL_SEC = 24 * 60 * 60;
const HOTEL_SENTIMENTS_TTL_SEC = 24 * 60 * 60;

export type AmadeusCredentials = AmadeusOAuthConfig;

function amadeusApiBaseUrl(env: 'test' | 'production'): string {
  return env === 'production' ? 'https://api.amadeus.com' : 'https://test.api.amadeus.com';
}

function hotelsByCityCacheKey(input: SearchHotelsByCityInput): string {
  const ratings = input.ratings?.slice().sort().join(',') ?? '';
  return `amadeus:hotels-by-city:${input.cityCode}:${input.radius ?? ''}:${input.radiusUnit ?? ''}:${ratings}`;
}

/** Maps Amadeus error envelopes (4xx body) to canonical adapter errors. */
function mapAmadeusErrorBody(status: number, body: unknown): AmadeusError {
  const errors = (body as { errors?: Array<{ code?: number; title?: string }> })?.errors ?? [];
  for (const e of errors) {
    const t = (e.title ?? '').toUpperCase();
    if (t.includes('OFFER') && t.includes('EXPIRED')) return { kind: 'offer_expired' };
    if (t.includes('PRICE') && t.includes('CHANG')) {
      return { kind: 'pricing_changed', offerId: 'unknown' };
    }
  }
  return {
    kind: 'http',
    error: { kind: 'upstream_4xx', status, body },
  };
}

interface AuthorizedRequestInit {
  readonly method: 'GET' | 'POST' | 'DELETE';
  readonly pathname: string;
  readonly searchParams?: Readonly<Record<string, string | undefined>>;
  readonly jsonBody?: unknown;
  readonly idempotencyKey?: string;
  readonly extraHeaders?: Readonly<Record<string, string>>;
}

async function authorizedJsonRequest(
  oauth: AmadeusOAuthConfig,
  init: AuthorizedRequestInit,
): Promise<
  Result<
    {
      readonly status: number;
      readonly json: unknown | undefined;
    },
    AmadeusError
  >
> {
  const token = await getAmadeusAccessToken(oauth);
  if (!token.ok) return err(token.error);

  const url = new URL(init.pathname, oauth.baseUrl);
  if (init.searchParams !== undefined) {
    for (const [k, v] of Object.entries(init.searchParams)) {
      if (v !== undefined) url.searchParams.set(k, v);
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token.value}`,
    Accept: 'application/json',
    ...(init.extraHeaders ?? {}),
  };

  const body =
    init.jsonBody !== undefined
      ? ({ kind: 'json', value: init.jsonBody } as const)
      : ({ kind: 'none' } as const);

  const res = await retryingJsonRequest({
    url: url.toString(),
    method: init.method,
    headers,
    body,
    ...(init.idempotencyKey !== undefined ? { idempotencyKey: init.idempotencyKey } : {}),
  });

  if (!res.ok) return err({ kind: 'http', error: res.error });
  return ok({ status: res.value.status, json: res.value.json });
}

export type PricedOffer = {
  readonly offer: Offer;
  readonly cancellationPolicy: CancellationPolicy;
};

export type AmadeusClient = {
  readonly searchHotelsByCity: (
    input: SearchHotelsByCityInput,
  ) => Promise<Result<HotelsByCityResponse, AmadeusError>>;
  readonly getHotelOffers: (
    input: HotelOffersInput,
  ) => Promise<Result<HotelOffersResponse, AmadeusError>>;
  /**
   * Locks the price by fetching the offer detail (never cached). Maps the
   * response into a domain `Offer` + parsed `CancellationPolicy`. On
   * `OFFER_EXPIRED` returns `err({ kind: 'offer_expired' })`.
   */
  readonly priceOffer: (input: {
    readonly offerId: string;
  }) => Promise<Result<PricedOffer, AmadeusError>>;
  readonly createHotelOrder: (
    input: HotelOrderCreateInput,
    options: { readonly idempotencyKey: string },
  ) => Promise<Result<HotelOrderResponse, AmadeusError>>;
  readonly getHotelOrder: (orderId: string) => Promise<Result<unknown, AmadeusError>>;
  readonly cancelHotelOrder: (orderId: string) => Promise<Result<unknown, AmadeusError>>;
  /**
   * Fetches sentiment scores for one or more hotels (Amadeus e-Reputation
   * v2). Each score is on a 0–100 integer scale. Cached for 24h since
   * sentiments evolve slowly. Used to seed `AggregateRating` JSON-LD on
   * hotel detail pages and trust signals in UI.
   */
  readonly getHotelSentiments: (
    input: HotelSentimentsInput,
  ) => Promise<Result<HotelSentimentsResponse, AmadeusError>>;
};

export function createAmadeusClient(oauth: AmadeusCredentials): AmadeusClient {
  return {
    searchHotelsByCity: async (input) => {
      const validated = SearchHotelsByCityInputSchema.safeParse(input);
      if (!validated.success) {
        return err({ kind: 'parse_failure', details: 'invalid search input' });
      }
      const v = validated.data;
      const cacheKey = hotelsByCityCacheKey(v);
      const cachedRaw = await redisGetString(oauth.redis, cacheKey);
      if (cachedRaw !== null) {
        let raw: unknown;
        try {
          raw = JSON.parse(cachedRaw);
        } catch {
          raw = undefined;
        }
        if (raw !== undefined) {
          const parsed = HotelsByCityResponseSchema.safeParse(raw);
          if (parsed.success) return ok(parsed.data);
        }
      }

      const searchParams = {
        cityCode: v.cityCode,
        ...(v.radius !== undefined ? { radius: String(v.radius) } : {}),
        ...(v.radiusUnit !== undefined ? { radiusUnit: v.radiusUnit } : {}),
        ...(v.ratings !== undefined && v.ratings.length > 0
          ? { ratings: v.ratings.join(',') }
          : {}),
      };

      const r = await authorizedJsonRequest(oauth, {
        method: 'GET',
        pathname: '/v1/reference-data/locations/hotels/by-city',
        searchParams,
      });
      if (!r.ok) return r;
      if (r.value.json === undefined) {
        return err({ kind: 'parse_failure', details: 'empty hotels response' });
      }
      const parsed = HotelsByCityResponseSchema.safeParse(r.value.json);
      if (!parsed.success) {
        return err({ kind: 'parse_failure', details: 'hotels response shape' });
      }
      await redisSetStringWithTtl(
        oauth.redis,
        cacheKey,
        JSON.stringify(parsed.data),
        HOTELS_BY_CITY_TTL_SEC,
      );
      return ok(parsed.data);
    },

    getHotelOffers: async (input) => {
      const validated = HotelOffersInputSchema.safeParse(input);
      if (!validated.success) {
        return err({ kind: 'parse_failure', details: 'invalid hotel offers input' });
      }
      const v = validated.data;
      const cacheKey = amadeusHotelOffersCacheKey({
        hotelIds: v.hotelIds,
        checkInDate: v.checkInDate,
        checkOutDate: v.checkOutDate,
        adults: v.adults,
        childAges: v.childAges,
        currency: v.currency,
      });

      const cachedRaw = await redisGetString(oauth.redis, cacheKey);
      if (cachedRaw !== null) {
        let raw: unknown;
        try {
          raw = JSON.parse(cachedRaw);
        } catch {
          raw = undefined;
        }
        if (raw !== undefined) {
          const parsed = HotelOffersResponseSchema.safeParse(raw);
          if (parsed.success) return ok(parsed.data);
        }
      }

      const r = await authorizedJsonRequest(oauth, {
        method: 'GET',
        pathname: '/v3/shopping/hotel-offers',
        searchParams: {
          hotelIds: v.hotelIds.join(','),
          checkInDate: v.checkInDate,
          checkOutDate: v.checkOutDate,
          adults: String(v.adults),
          currency: v.currency,
          ...(v.childAges !== undefined && v.childAges.length > 0
            ? { childAges: v.childAges.join(',') }
            : {}),
        },
      });
      if (!r.ok) return r;
      if (r.value.json === undefined) {
        return err({ kind: 'parse_failure', details: 'empty offers response' });
      }
      const parsed = HotelOffersResponseSchema.safeParse(r.value.json);
      if (!parsed.success) {
        return err({ kind: 'parse_failure', details: 'offers response shape' });
      }
      await redisSetStringWithTtl(
        oauth.redis,
        cacheKey,
        JSON.stringify(parsed.data),
        HOTEL_OFFERS_TTL_SEC,
      );
      return ok(parsed.data);
    },

    priceOffer: async (input) => {
      const validated = OfferDetailInputSchema.safeParse(input);
      if (!validated.success) {
        return err({ kind: 'parse_failure', details: 'invalid offer id input' });
      }
      const lockedAt = new Date().toISOString();
      const r = await authorizedJsonRequest(oauth, {
        method: 'GET',
        pathname: `/v3/shopping/hotel-offers/${encodeURIComponent(validated.data.offerId)}`,
      });
      if (!r.ok) {
        // Map 4xx OFFER_EXPIRED into a typed kind.
        const e = r.error;
        if (e.kind === 'http' && e.error.kind === 'upstream_4xx') {
          return err(mapAmadeusErrorBody(e.error.status, e.error.body));
        }
        return r;
      }
      if (r.value.json === undefined) {
        return err({ kind: 'parse_failure', details: 'empty offer detail' });
      }
      const parsed = OfferDetailResponseSchema.safeParse(r.value.json);
      if (!parsed.success) {
        return err({ kind: 'parse_failure', details: 'offer detail shape' });
      }
      const data = parsed.data.data;
      if (data.available === false) {
        return err({ kind: 'offer_not_available', offerId: validated.data.offerId });
      }
      const first = data.offers[0];
      if (first === undefined) {
        return err({ kind: 'offer_not_available', offerId: validated.data.offerId });
      }
      return amadeusOfferToDomain(first, { hotelId: data.hotel.hotelId, lockedAt });
    },

    createHotelOrder: async (input, options) => {
      const validated = HotelOrderCreateInputSchema.safeParse(input);
      if (!validated.success) {
        return err({ kind: 'parse_failure', details: 'invalid hotel order input' });
      }
      if (options.idempotencyKey.length === 0) {
        return err({ kind: 'parse_failure', details: 'idempotencyKey is required' });
      }
      const r = await authorizedJsonRequest(oauth, {
        method: 'POST',
        pathname: '/v1/booking/hotel-orders',
        jsonBody: validated.data,
        idempotencyKey: options.idempotencyKey,
      });
      if (!r.ok) {
        const e = r.error;
        if (e.kind === 'http' && e.error.kind === 'upstream_4xx') {
          return err(mapAmadeusErrorBody(e.error.status, e.error.body));
        }
        return r;
      }
      if (r.value.json === undefined) {
        return err({ kind: 'parse_failure', details: 'empty hotel order response' });
      }
      const parsed = HotelOrderResponseSchema.safeParse(r.value.json);
      if (!parsed.success) {
        return err({ kind: 'parse_failure', details: 'hotel order response shape' });
      }
      return ok(parsed.data);
    },

    getHotelOrder: async (_orderId: string) =>
      err({ kind: 'not_implemented', operation: 'GET /v2/booking/hotel-orders/{orderId}' }),

    cancelHotelOrder: async (_orderId: string) =>
      err({ kind: 'not_implemented', operation: 'DELETE /v2/booking/hotel-orders/{orderId}' }),

    getHotelSentiments: async (input) => {
      const validated = HotelSentimentsInputSchema.safeParse(input);
      if (!validated.success) {
        return err({ kind: 'parse_failure', details: 'invalid sentiments input' });
      }
      const v = validated.data;
      const cacheKey = amadeusHotelSentimentsCacheKey(v.hotelIds);
      const cachedRaw = await redisGetString(oauth.redis, cacheKey);
      if (cachedRaw !== null) {
        let raw: unknown;
        try {
          raw = JSON.parse(cachedRaw);
        } catch {
          raw = undefined;
        }
        if (raw !== undefined) {
          const parsed = HotelSentimentsResponseSchema.safeParse(raw);
          if (parsed.success) return ok(parsed.data);
        }
      }

      const r = await authorizedJsonRequest(oauth, {
        method: 'GET',
        pathname: '/v2/e-reputation/hotel-sentiments',
        searchParams: { hotelIds: v.hotelIds.join(',') },
      });
      if (!r.ok) return r;
      if (r.value.json === undefined) {
        return err({ kind: 'parse_failure', details: 'empty sentiments response' });
      }
      const parsed = HotelSentimentsResponseSchema.safeParse(r.value.json);
      if (!parsed.success) {
        return err({ kind: 'parse_failure', details: 'sentiments response shape' });
      }
      await redisSetStringWithTtl(
        oauth.redis,
        cacheKey,
        JSON.stringify(parsed.data),
        HOTEL_SENTIMENTS_TTL_SEC,
      );
      return ok(parsed.data);
    },
  };
}

export function createAmadeusClientFromSharedEnv(source?: SharedEnv): AmadeusClient {
  const env = source ?? loadSharedEnv();
  const baseUrl = amadeusApiBaseUrl(env.AMADEUS_ENV === 'production' ? 'production' : 'test');
  const redis = getRedis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
  return createAmadeusClient({
    baseUrl,
    clientId: env.AMADEUS_API_KEY,
    clientSecret: env.AMADEUS_API_SECRET,
    redis,
  });
}
