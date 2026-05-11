import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { searchCitiesCatalogOnServer } from '@/lib/search/cities-catalog';
import { searchHotelsCatalogOnServer } from '@/lib/search/hotels-catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  q: z.string().min(1).max(80),
  locale: z.enum(['fr', 'en']).default('fr'),
  hotels: z.coerce.number().int().min(1).max(10).default(5),
  cities: z.coerce.number().int().min(1).max(10).default(5),
});

/**
 * Public destination + hotel suggest endpoint (skill: search-engineering).
 * Uses the **search-only** Algolia API key wired in `@/lib/search/*`.
 *
 * No PII is logged; failures yield empty arrays rather than upstream errors.
 * TODO: add Upstash rate-limit when the header search bar lands.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    q: url.searchParams.get('q') ?? '',
    locale: url.searchParams.get('locale') ?? undefined,
    hotels: url.searchParams.get('hotels') ?? undefined,
    cities: url.searchParams.get('cities') ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'invalid_query' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const { q, locale, hotels: hLimit, cities: cLimit } = parsed.data;

  const [hotels, cities] = await Promise.all([
    searchHotelsCatalogOnServer(locale, q, hLimit),
    searchCitiesCatalogOnServer(locale, q, cLimit),
  ]);

  return NextResponse.json(
    {
      ok: true,
      query: q,
      locale,
      hotels: hotels.map((h) => ({
        objectID: h.objectID,
        name: h.name,
        city: h.city,
        region: h.region,
        url_path: h.url_path,
        is_palace: h.is_palace,
        stars: h.stars,
      })),
      cities: cities.map((c) => ({
        objectID: c.objectID,
        name: c.name,
        region: c.region,
        url_path: c.url_path,
        hotels_count: c.hotels_count,
        is_popular: c.is_popular,
      })),
    },
    {
      headers: {
        'Cache-Control': 'private, max-age=10, stale-while-revalidate=60',
      },
    },
  );
}
