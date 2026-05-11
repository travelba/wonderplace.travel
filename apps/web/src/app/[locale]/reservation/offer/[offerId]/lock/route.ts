import { NextResponse, type NextRequest } from 'next/server';

import { isRoutingLocale } from '@/i18n/routing';
import { setDraftCookie } from '@/server/booking/draft-cookie';
import { isFakeOffersEnabled } from '@/server/booking/dev-fake-offer';
import { lockOffer, type LockOfferInput } from '@/server/booking/lock-offer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function inviteUrl(req: NextRequest, locale: string): URL {
  const base = locale === 'fr' ? '/reservation/invite' : `/${locale}/reservation/invite`;
  return new URL(base, req.nextUrl.origin);
}

function backOnError(
  req: NextRequest,
  locale: string,
  hotelId: string | undefined,
  errorKind: string,
): URL {
  const base = locale === 'fr' ? '/recherche' : `/${locale}/recherche`;
  const url = new URL(base, req.nextUrl.origin);
  if (hotelId !== undefined) url.searchParams.set('hotelId', hotelId);
  url.searchParams.set('error', errorKind);
  return url;
}

function pickString(value: FormDataEntryValue | null): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function pickInt(value: FormDataEntryValue | null, fallback: number): number {
  if (typeof value !== 'string') return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * Entry point of the paid tunnel. POST-only — the route is mutating
 * (calls Amadeus `priceOffer` and creates a draft) and must not be
 * cached, prefetched, or replayable as a GET.
 *
 * Form fields:
 *   - hotelId  : UUID (required)
 *   - fake     : '1' to bypass Amadeus and synthesise an offer
 *                (only honoured outside production)
 *   - checkIn  : ISO date YYYY-MM-DD (required when fake=1)
 *   - checkOut : ISO date YYYY-MM-DD (required when fake=1)
 *   - adults   : integer ≥1
 *   - children : integer ≥0
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ locale: string; offerId: string }> },
): Promise<NextResponse> {
  const { locale: rawLocale, offerId: rawOfferId } = await ctx.params;
  const locale = isRoutingLocale(rawLocale) ? rawLocale : 'fr';
  const offerId = decodeURIComponent(rawOfferId ?? '');

  if (offerId.length === 0) {
    return NextResponse.json({ ok: false, error: 'offer_id_required' }, { status: 400 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_form_body' }, { status: 400 });
  }

  const hotelId = pickString(form.get('hotelId')) ?? '';
  if (!UUID_RE.test(hotelId)) {
    return NextResponse.json({ ok: false, error: 'invalid_hotel_id' }, { status: 400 });
  }

  const fakeRequested = pickString(form.get('fake')) === '1';
  const fake = fakeRequested && isFakeOffersEnabled();

  const lockInput: LockOfferInput = {
    offerId,
    hotelId,
    locale,
    ...(fake ? { fake: true } : {}),
  };

  if (fake) {
    const checkIn = pickString(form.get('checkIn'));
    const checkOut = pickString(form.get('checkOut'));
    if (
      checkIn === undefined ||
      checkOut === undefined ||
      !ISO_DATE_RE.test(checkIn) ||
      !ISO_DATE_RE.test(checkOut) ||
      Date.parse(`${checkOut}T00:00:00Z`) <= Date.parse(`${checkIn}T00:00:00Z`)
    ) {
      return NextResponse.redirect(backOnError(req, locale, hotelId, 'invalid_stay'), 303);
    }
    const adults = Math.max(1, pickInt(form.get('adults'), 2));
    const children = Math.max(0, pickInt(form.get('children'), 0));
    Object.assign(lockInput, {
      stay: { checkIn, checkOut },
      guests: { adults, children },
    });
  }

  const result = await lockOffer(lockInput);
  if (!result.ok) {
    return NextResponse.redirect(backOnError(req, locale, hotelId, result.error.kind), 303);
  }

  await setDraftCookie(result.value.draftId, result.value.ttlSec);
  return NextResponse.redirect(inviteUrl(req, locale), 303);
}
