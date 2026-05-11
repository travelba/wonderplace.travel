import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { IntegrationRedis } from '../redis/cache-helpers.js';

import { createAmadeusClient } from './amadeus-client.js';
import type { HotelOrderCreateInput } from './types.js';

function createMemoryRedis(): IntegrationRedis {
  const store = new Map<string, string>();
  return {
    get: async (key) => store.get(key) ?? null,
    set: async (key, value, opts) => {
      if (opts?.nx === true && store.has(key)) return null;
      store.set(key, value);
      return 'OK';
    },
    del: async (...keys) => {
      let removed = 0;
      for (const k of keys) {
        if (store.delete(k)) removed += 1;
      }
      return removed;
    },
  };
}

const baseUrl = 'https://test.api.amadeus.com';

const baseCfg = (redis: IntegrationRedis) => ({
  baseUrl,
  clientId: 'test-id',
  clientSecret: 'test-secret',
  redis,
});

const oauthHandler = http.post(`${baseUrl}/v1/security/oauth2/token`, () =>
  HttpResponse.json({
    access_token: 'fake-token',
    expires_in: 3600,
    token_type: 'Bearer',
  }),
);

const offerDetailJson = {
  data: {
    type: 'hotel-offers',
    hotel: { hotelId: 'HTLPAR123', name: 'Hôtel de Test', cityCode: 'PAR' },
    available: true,
    offers: [
      {
        id: 'OFFER123',
        checkInDate: '2026-07-01',
        checkOutDate: '2026-07-04',
        rateCode: 'RAC',
        room: {
          typeEstimated: { category: 'DELUXE_KING', beds: 1, bedType: 'KING' },
          description: { text: 'Deluxe Room with King Bed' },
        },
        guests: { adults: 2 },
        price: { currency: 'EUR', total: '420.00', base: '380.00' },
        policies: {
          paymentType: 'guarantee',
          cancellations: [
            {
              description: { text: 'Free cancellation until 2026-06-25.' },
              amount: '0.00',
              deadline: '2026-06-25T18:00:00+02:00',
            },
          ],
        },
      },
    ],
  },
};

const server = setupServer(oauthHandler);

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

beforeEach(() => {
  server.resetHandlers(oauthHandler);
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

describe('priceOffer', () => {
  it('returns a domain Offer + parsed CancellationPolicy on 200', async () => {
    server.use(
      http.get(`${baseUrl}/v3/shopping/hotel-offers/:offerId`, () =>
        HttpResponse.json(offerDetailJson),
      ),
    );

    const client = createAmadeusClient(baseCfg(createMemoryRedis()));
    const r = await client.priceOffer({ offerId: 'OFFER123' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.offer.id).toBe('OFFER123');
    expect(r.value.offer.provider).toBe('amadeus');
    expect(r.value.offer.hotelId).toBe('HTLPAR123');
    expect(r.value.offer.totalPrice.amountMinor).toBe(42_000);
    expect(r.value.cancellationPolicy.kind).toBe('free_until');
    expect(r.value.offer.cancellationPolicyText).toBe('Free cancellation until 2026-06-25.');
  });

  it('surfaces offer_expired when Amadeus returns a 4xx OFFER_EXPIRED', async () => {
    server.use(
      http.get(
        `${baseUrl}/v3/shopping/hotel-offers/:offerId`,
        () =>
          new HttpResponse(JSON.stringify({ errors: [{ code: 1257, title: 'OFFER EXPIRED' }] }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );

    const client = createAmadeusClient(baseCfg(createMemoryRedis()));
    const r = await client.priceOffer({ offerId: 'OFFER123' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('offer_expired');
  });

  it('surfaces offer_not_available when available=false', async () => {
    server.use(
      http.get(`${baseUrl}/v3/shopping/hotel-offers/:offerId`, () =>
        HttpResponse.json({
          ...offerDetailJson,
          data: { ...offerDetailJson.data, available: false },
        }),
      ),
    );

    const client = createAmadeusClient(baseCfg(createMemoryRedis()));
    const r = await client.priceOffer({ offerId: 'OFFER123' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('offer_not_available');
  });
});

describe('createHotelOrder', () => {
  const orderInput: HotelOrderCreateInput = {
    data: {
      type: 'hotel-order',
      guests: [
        {
          tid: 1,
          title: 'MR',
          firstName: 'Jean',
          lastName: 'Dupont',
          phone: '+33612345678',
          email: 'jean@example.com',
        },
      ],
      roomAssociations: [
        {
          guestReferences: [{ guestReference: '1' }],
          hotelOfferId: 'OFFER123',
        },
      ],
      payment: { method: 'paymentReference', paymentId: 'pi_test_123' },
    },
  };

  it('posts with Idempotency-Key header and parses the 201 response', async () => {
    let capturedKey: string | undefined;
    let capturedBody: unknown;
    server.use(
      http.post(`${baseUrl}/v1/booking/hotel-orders`, async ({ request }) => {
        capturedKey = request.headers.get('Idempotency-Key') ?? undefined;
        capturedBody = await request.json();
        return HttpResponse.json(
          {
            data: {
              type: 'hotel-order',
              id: 'ORDER-XYZ',
              hotelBookings: [
                {
                  id: 'BK1',
                  bookingStatus: 'CONFIRMED',
                  hotelProviderInformation: [
                    { confirmationNumber: 'CONF12345', hotelProviderCode: 'ACR' },
                  ],
                },
              ],
              associatedRecords: [{ reference: 'PNR123', originSystemCode: '1A' }],
            },
          },
          { status: 201 },
        );
      }),
    );

    const client = createAmadeusClient(baseCfg(createMemoryRedis()));
    const r = await client.createHotelOrder(orderInput, { idempotencyKey: 'idem-abc-123' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(capturedKey).toBe('idem-abc-123');
    expect(r.value.data.id).toBe('ORDER-XYZ');
    expect(r.value.data.hotelBookings?.[0]?.bookingStatus).toBe('CONFIRMED');
    expect(capturedBody).toMatchObject({ data: { type: 'hotel-order' } });
  });

  it('rejects empty idempotency keys at the boundary', async () => {
    const client = createAmadeusClient(baseCfg(createMemoryRedis()));
    const r = await client.createHotelOrder(orderInput, { idempotencyKey: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('parse_failure');
  });

  it('maps 4xx OFFER_EXPIRED on order creation', async () => {
    server.use(
      http.post(
        `${baseUrl}/v1/booking/hotel-orders`,
        () =>
          new HttpResponse(JSON.stringify({ errors: [{ code: 1257, title: 'OFFER EXPIRED' }] }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );
    const client = createAmadeusClient(baseCfg(createMemoryRedis()));
    const r = await client.createHotelOrder(orderInput, { idempotencyKey: 'idem-1' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('offer_expired');
  });
});

describe('getHotelSentiments', () => {
  const sentimentsJson = {
    data: [
      {
        type: 'hotelSentiment',
        hotelId: 'HTLPAR123',
        overallRating: 92,
        numberOfRatings: 310,
        numberOfReviews: 248,
        sentiments: {
          sleepQuality: 88,
          service: 96,
          location: 99,
          staff: 100,
        },
      },
    ],
  };

  it('returns the parsed payload on 200 and caches it for the next call', async () => {
    let callCount = 0;
    server.use(
      http.get(`${baseUrl}/v2/e-reputation/hotel-sentiments`, ({ request }) => {
        callCount += 1;
        const url = new URL(request.url);
        expect(url.searchParams.get('hotelIds')).toBe('HTLPAR123');
        return HttpResponse.json(sentimentsJson);
      }),
    );

    const redis = createMemoryRedis();
    const client = createAmadeusClient(baseCfg(redis));

    const first = await client.getHotelSentiments({ hotelIds: ['HTLPAR123'] });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.data[0]?.overallRating).toBe(92);
    expect(first.value.data[0]?.sentiments?.staff).toBe(100);

    // Second call must hit the cache; the upstream handler stays at 1 call.
    const second = await client.getHotelSentiments({ hotelIds: ['HTLPAR123'] });
    expect(second.ok).toBe(true);
    expect(callCount).toBe(1);
  });

  it('normalises hotel id ordering for cache lookups', async () => {
    let callCount = 0;
    server.use(
      http.get(`${baseUrl}/v2/e-reputation/hotel-sentiments`, () => {
        callCount += 1;
        return HttpResponse.json({
          data: [
            { type: 'hotelSentiment', hotelId: 'A', overallRating: 80, numberOfReviews: 10 },
            { type: 'hotelSentiment', hotelId: 'B', overallRating: 85, numberOfReviews: 20 },
          ],
        });
      }),
    );

    const redis = createMemoryRedis();
    const client = createAmadeusClient(baseCfg(redis));

    await client.getHotelSentiments({ hotelIds: ['B', 'A'] });
    await client.getHotelSentiments({ hotelIds: ['A', 'B'] });
    expect(callCount).toBe(1);
  });

  it('rejects empty or oversized hotelIds arrays at the input boundary', async () => {
    const client = createAmadeusClient(baseCfg(createMemoryRedis()));

    const empty = await client.getHotelSentiments({ hotelIds: [] });
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.error.kind).toBe('parse_failure');

    const tooMany = await client.getHotelSentiments({
      hotelIds: Array.from({ length: 21 }, (_, i) => `H${i}`),
    });
    expect(tooMany.ok).toBe(false);
  });

  it('surfaces a parse_failure when Amadeus returns an unexpected shape', async () => {
    server.use(
      http.get(`${baseUrl}/v2/e-reputation/hotel-sentiments`, () =>
        HttpResponse.json({ unexpected: true }),
      ),
    );
    const client = createAmadeusClient(baseCfg(createMemoryRedis()));
    const r = await client.getHotelSentiments({ hotelIds: ['HTLPAR123'] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('parse_failure');
  });

  it('preserves Amadeus warnings about missing hotel ids (passthrough)', async () => {
    server.use(
      http.get(`${baseUrl}/v2/e-reputation/hotel-sentiments`, () =>
        HttpResponse.json({
          data: [],
          warnings: [
            { code: 4920, title: 'INVALID DATA RECEIVED', detail: 'Unknown hotel HTLPAR999' },
          ],
        }),
      ),
    );
    const client = createAmadeusClient(baseCfg(createMemoryRedis()));
    const r = await client.getHotelSentiments({ hotelIds: ['HTLPAR999'] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.warnings?.[0]?.code).toBe(4920);
    expect(r.value.data).toHaveLength(0);
  });
});
