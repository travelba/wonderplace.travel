import { NextResponse, type NextRequest } from 'next/server';

import { getPriceComparison } from '@/server/price-comparison/service';
import { gateByIp } from '@/server/price-comparison/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

function clientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff !== null) {
    const first = xff.split(',')[0]?.trim();
    if (first !== undefined && first.length > 0) return first;
  }
  return req.headers.get('x-real-ip') ?? '0.0.0.0';
}

/**
 * Public price comparator endpoint (skill: competitive-pricing-comparison).
 *
 * Strict contract — addendum v3.2:
 *  - returns competitor prices in TTC EUR cents, **never** as clickable
 *    refs or URLs.
 *  - hides unavailable rows (the client never receives an `N/A`).
 *  - tagged `cached: true` when served from the persisted fallback after
 *    daily quota exhaustion so the UI can surface a disclaimer.
 *  - rate-limited to 30 req/min/IP.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);

  const ip = clientIp(req);
  const verdict = await gateByIp(ip);
  if (!verdict.ok) {
    return NextResponse.json(
      { ok: false, error: 'rate_limited' },
      {
        status: 429,
        headers: {
          ...NO_STORE,
          'Retry-After': String(verdict.retryAfterSec),
        },
      },
    );
  }

  const hotelId = url.searchParams.get('hotelId') ?? '';
  const checkIn = url.searchParams.get('checkIn') ?? '';
  const checkOut = url.searchParams.get('checkOut') ?? '';
  const adults = url.searchParams.get('adults') ?? '2';

  const outcome = await getPriceComparison({
    hotelId,
    checkIn,
    checkOut,
    adults: Number.parseInt(adults, 10),
  });

  if (!outcome.available) {
    return NextResponse.json(
      { ok: true, available: false, reason: outcome.reason },
      { headers: NO_STORE },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      available: true,
      source: outcome.source,
      cached: outcome.cached,
      competitors: outcome.normalized.competitors,
      benefitsValueMinor: outcome.normalized.benefitsValueMinor,
      stay: outcome.normalized.stay,
    },
    {
      // The vendor data is allowed to be cached at the CDN for 60 s — even
      // under the per-IP rate limit, this absorbs hot-path bursts on the
      // same hotel detail page across users without re-hitting Makcorps.
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
    },
  );
}
