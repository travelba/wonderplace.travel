import 'server-only';

import { BookingConfirmationGuest, renderEmailHtml, renderEmailText } from '@cct/emails';
import {
  buildIdempotencyKey,
  confirmBooking,
  generateBookingRef,
  type BookingDraft,
} from '@cct/domain/booking';
import { err, ok, type Result } from '@cct/domain/shared';
import { sendBrevoTransactionalEmail } from '@cct/integrations/brevo';

import { env } from '@/lib/env';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getOptionalUser } from '@/server/auth/session';

import { getBookingProvider } from './booking-provider';
import { getPaymentProvider } from './payment-provider';
import { serverClock, webCryptoRandomSource } from './ports';
import { deleteDraft, loadDraft, saveDraft, type DraftHotelSnapshot } from './draft-store';

export type ConfirmPaymentError =
  | { readonly kind: 'no_draft' }
  | { readonly kind: 'invalid_state'; readonly state: BookingDraft['state'] }
  | { readonly kind: 'missing_offer' }
  | { readonly kind: 'missing_guest' }
  | { readonly kind: 'payment_declined'; readonly reason?: string }
  | { readonly kind: 'booking_upstream'; readonly details: string }
  | { readonly kind: 'database'; readonly details: string }
  | { readonly kind: 'internal'; readonly details: string };

export interface ConfirmPaymentSuccess {
  readonly bookingRef: string;
  readonly hotelName: string;
}

const fmtPrice = (amountMinor: number, locale: 'fr' | 'en'): string =>
  new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(amountMinor / 100);

const isoDateOnly = (s: string): string => s.slice(0, 10);

function nightCount(checkIn: string, checkOut: string): number {
  const inMs = Date.parse(`${checkIn}T00:00:00Z`);
  const outMs = Date.parse(`${checkOut}T00:00:00Z`);
  if (!Number.isFinite(inMs) || !Number.isFinite(outMs)) return 1;
  const diff = Math.round((outMs - inMs) / 86_400_000);
  return diff > 0 ? diff : 1;
}

async function sendConfirmationEmail(input: {
  readonly locale: 'fr' | 'en';
  readonly hotel: DraftHotelSnapshot;
  readonly draft: BookingDraft;
  readonly bookingRef: string;
}): Promise<void> {
  if (input.draft.offer === undefined || input.draft.guest === undefined) return;

  const totalLabel = fmtPrice(input.draft.offer.totalPrice.amountMinor, input.locale);
  const element = BookingConfirmationGuest({
    locale: input.locale,
    guestFirstName: input.draft.guest.firstName,
    hotelName: input.hotel.name,
    hotelLocation: `${input.hotel.city}, ${input.hotel.region}`,
    checkIn: input.draft.offer.stay.checkIn,
    checkOut: input.draft.offer.stay.checkOut,
    totalLabel,
    bookingRef: input.bookingRef,
    cancellationPolicyText: input.draft.offer.cancellationPolicyText,
  });

  const [html, text] = await Promise.all([renderEmailHtml(element), renderEmailText(element)]);

  const subject =
    input.locale === 'en'
      ? `Booking confirmed — ${input.hotel.name} (${input.bookingRef})`
      : `Réservation confirmée — ${input.hotel.name} (${input.bookingRef})`;

  await sendBrevoTransactionalEmail(
    { apiKey: env.BREVO_API_KEY },
    {
      sender: { email: env.BREVO_SENDER_EMAIL, name: env.BREVO_SENDER_NAME },
      to: [{ email: input.draft.guest.email }],
      subject,
      htmlContent: html,
      ...(text.length > 0 ? { textContent: text } : {}),
    },
  );
}

/**
 * Closes the paid tunnel:
 *   1. Loads + validates the draft (must be in `payment_pending`).
 *   2. Captures the payment via the active `PaymentProvider`
 *      (stub today; live Amadeus/Adyen tomorrow).
 *   3. Creates the upstream reservation via the active `BookingProvider`,
 *      keyed by a deterministic domain idempotency key so retries
 *      collapse server-side.
 *   4. Generates a domain `BookingRef`, persists a `bookings` row via
 *      service-role, then transitions the draft to `confirmed`.
 *   5. Sends the React-Email confirmation to the guest.
 *   6. Deletes the draft from Redis (cookie is cleared by the caller).
 *
 * Each external boundary returns a typed Result; the page surface
 * translates errors to localised UI without leaking provider internals.
 */
export async function confirmPaymentAndCreateBooking(
  draftId: string,
): Promise<Result<ConfirmPaymentSuccess, ConfirmPaymentError>> {
  const persisted = await loadDraft(draftId);
  if (persisted === null) {
    return err({ kind: 'no_draft' });
  }
  const draft = persisted.draft;
  if (draft.state !== 'payment_pending') {
    return err({ kind: 'invalid_state', state: draft.state });
  }
  if (draft.offer === undefined) {
    return err({ kind: 'missing_offer' });
  }
  if (draft.guest === undefined) {
    return err({ kind: 'missing_guest' });
  }

  const payment = getPaymentProvider();
  const init = await payment.initiate(draft.offer, draft.id);
  if (!init.ok) {
    return err({ kind: 'payment_declined', reason: init.error.kind });
  }
  const cap = await payment.capture(init.value.sessionRef);
  if (!cap.ok) {
    return err({
      kind: 'payment_declined',
      reason: cap.error.kind,
    });
  }

  // Bind the booking to the signed-in user (if any). RLS surfaces these
  // bookings in `/compte` via the `bookings_select_own` policy.
  const sessionUser = await getOptionalUser();
  const userId = sessionUser !== null ? sessionUser.id : null;

  const idempotencyKey = buildIdempotencyKey({
    offerId: draft.offer.id,
    hotelId: draft.offer.hotelId,
    userId: userId ?? undefined,
    stay: draft.offer.stay,
    guests: draft.offer.guests,
    totalAmountMinor: draft.offer.totalPrice.amountMinor,
  });

  const booking = getBookingProvider();
  const order = await booking.createOrder({
    offer: draft.offer,
    guest: draft.guest,
    paymentRef: cap.value.paymentRef,
    idempotencyKey,
  });
  if (!order.ok) {
    return err({ kind: 'booking_upstream', details: order.error.kind });
  }

  const refResult = generateBookingRef(serverClock, webCryptoRandomSource);
  if (!refResult.ok) {
    return err({ kind: 'internal', details: refResult.error.kind });
  }
  const bookingRef: string = refResult.value;

  const totalEur = draft.offer.totalPrice.amountMinor / 100;
  const nights = nightCount(draft.offer.stay.checkIn, draft.offer.stay.checkOut);
  const pricePerNight = Number((totalEur / nights).toFixed(2));

  const supabase = getSupabaseAdminClient();
  const insert = await supabase
    .from('bookings')
    .insert({
      booking_ref: bookingRef,
      hotel_id: persisted.hotel.id,
      user_id: userId,
      guest_firstname: draft.guest.firstName,
      guest_lastname: draft.guest.lastName,
      guest_email: draft.guest.email,
      guest_phone: draft.guest.phone,
      checkin_date: isoDateOnly(draft.offer.stay.checkIn),
      checkout_date: isoDateOnly(draft.offer.stay.checkOut),
      adults: draft.offer.guests.adults,
      children: draft.offer.guests.children,
      rate_code: draft.offer.roomCode,
      price_per_night: pricePerNight,
      total_price: totalEur,
      currency: draft.offer.totalPrice.currency,
      cancellation_policy: { rawText: draft.offer.cancellationPolicyText },
      payment_status: 'captured',
      amadeus_payment_ref: cap.value.paymentRef,
      status: 'confirmed',
      booking_channel: booking.channel,
      ...(order.value.pnr !== undefined ? { amadeus_pnr: order.value.pnr } : {}),
    })
    .select('id')
    .single();

  if (insert.error) {
    return err({ kind: 'database', details: insert.error.message });
  }

  const finalDraft = confirmBooking(draft);
  if (finalDraft.ok) {
    await saveDraft({ draft: finalDraft.value, hotel: persisted.hotel, locale: persisted.locale });
  }

  await sendConfirmationEmail({
    locale: persisted.locale,
    hotel: persisted.hotel,
    draft,
    bookingRef,
  });

  await deleteDraft(draftId);

  return ok({ bookingRef, hotelName: persisted.hotel.name });
}
