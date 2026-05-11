import 'server-only';

import type { NormalizedComparison } from '@cct/domain/price-comparison';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export interface PersistInput {
  readonly hotelId: string;
  readonly checkIn: string;
  readonly checkOut: string;
  readonly normalized: NormalizedComparison;
  /** TTL of the cached row, in seconds. Aligns with Redis cache TTL. */
  readonly ttlSec: number;
  readonly rawPayload?: unknown;
}

function minorToEuro(minor: number): number {
  // Postgres numeric(12,2) — store as decimal euros, not minor units, to
  // match the existing schema columns.
  return Math.round(minor) / 100;
}

function priceFor(
  normalized: NormalizedComparison,
  provider: 'booking_com' | 'expedia' | 'hotels_com' | 'official_site',
): number | null {
  const found = normalized.competitors.find(
    (c: NormalizedComparison['competitors'][number]) => c.provider === provider,
  );
  if (found === undefined) return null;
  return minorToEuro(found.amountMinor);
}

/**
 * Persist the comparator outcome in `price_comparisons` for analytics and
 * for offline rendering when the Makcorps daily quota is exhausted.
 *
 * Best-effort: any error is swallowed (logged in non-prod) — comparator
 * UX must never depend on a successful DB write.
 */
export async function persistComparison(input: PersistInput): Promise<void> {
  try {
    const supabase = getSupabaseAdminClient();
    const expiresAt = new Date(Date.now() + input.ttlSec * 1000).toISOString();
    await supabase.from('price_comparisons').insert({
      hotel_id: input.hotelId,
      checkin_date: input.checkIn,
      checkout_date: input.checkOut,
      price_concierge: null,
      price_booking: priceFor(input.normalized, 'booking_com'),
      price_expedia: priceFor(input.normalized, 'expedia'),
      price_hotelscom: priceFor(input.normalized, 'hotels_com'),
      price_official: priceFor(input.normalized, 'official_site'),
      raw_payload: input.rawPayload ?? null,
      expires_at: expiresAt,
    });
  } catch (e) {
    if (process.env['NODE_ENV'] !== 'production') {
      console.warn('[price-comparison] persistComparison failed:', e);
    }
  }
}

/**
 * Fallback read when the daily Makcorps quota is exhausted. Returns the
 * most recent persisted comparison for the same hotel + stay, regardless
 * of `expires_at`. The widget will surface a "valeurs cachées" disclaimer.
 */
export async function readLastPersistedComparison(
  hotelId: string,
  checkIn: string,
  checkOut: string,
): Promise<{
  readonly priceBooking: number | null;
  readonly priceExpedia: number | null;
  readonly priceHotelscom: number | null;
  readonly priceOfficial: number | null;
  readonly createdAt: string;
} | null> {
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from('price_comparisons')
      .select('price_booking, price_expedia, price_hotelscom, price_official, created_at')
      .eq('hotel_id', hotelId)
      .eq('checkin_date', checkIn)
      .eq('checkout_date', checkOut)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || data === null) return null;
    return {
      priceBooking: (data.price_booking as number | null) ?? null,
      priceExpedia: (data.price_expedia as number | null) ?? null,
      priceHotelscom: (data.price_hotelscom as number | null) ?? null,
      priceOfficial: (data.price_official as number | null) ?? null,
      createdAt: data.created_at as string,
    };
  } catch (e) {
    if (process.env['NODE_ENV'] !== 'production') {
      console.warn('[price-comparison] readLastPersistedComparison failed:', e);
    }
    return null;
  }
}
