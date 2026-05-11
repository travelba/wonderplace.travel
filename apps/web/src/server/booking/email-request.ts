import 'server-only';

import { EmailRequestGuest, EmailRequestOps, renderEmailHtml, renderEmailText } from '@cct/emails';
import { generateBookingRef, parseGuest, type Guest } from '@cct/domain/booking';
import { err, ok, type Result } from '@cct/domain/shared';
import { sendBrevoTransactionalEmail } from '@cct/integrations/brevo';
import { z } from 'zod';

import { env } from '@/lib/env';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

import {
  finaliseEmailRequestIdempotency,
  releaseEmailRequestIdempotency,
  reserveEmailRequestIdempotency,
} from './idempotency';
import { serverClock, webCryptoRandomSource } from './ports';
import { gateByEmail, gateByIp } from './rate-limit';

const DateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

export const EmailBookingRequestSchema = z.object({
  hotelId: z.string().uuid(),
  checkIn: DateOnly,
  checkOut: DateOnly,
  adults: z.number().int().min(1).max(9),
  children: z.number().int().min(0).max(9),
  guest: z.unknown(),
  roomPreference: z.string().trim().max(80).optional(),
  message: z.string().trim().max(1000).optional(),
  userId: z.string().uuid().optional(),
  locale: z.enum(['fr', 'en']).default('fr'),
  /** Best-effort client IP from `x-forwarded-for` — used for rate-limiting. */
  clientIp: z.string().min(1).max(64).optional(),
});

export type EmailBookingRequestInput = z.infer<typeof EmailBookingRequestSchema>;

export type EmailBookingRequestError =
  | { readonly kind: 'validation'; readonly field: string; readonly message: string }
  | {
      readonly kind: 'rate_limited';
      readonly retryAfterSec: number;
      readonly scope: 'ip' | 'email';
    }
  | { readonly kind: 'hotel_not_bookable_by_email'; readonly hotelId: string }
  | { readonly kind: 'duplicate'; readonly requestRef: string }
  | { readonly kind: 'database'; readonly details: string }
  | { readonly kind: 'internal'; readonly details: string };

export interface EmailBookingRequestSuccess {
  readonly requestRef: string;
  readonly hotelName: string;
  readonly deduplicated: boolean;
}

async function sendEmails(input: {
  readonly locale: 'fr' | 'en';
  readonly guest: Guest;
  readonly hotelName: string;
  readonly hotelId: string;
  readonly requestRef: string;
  readonly checkIn: string;
  readonly checkOut: string;
  readonly adults: number;
  readonly children: number;
  readonly roomPreference: string | undefined;
  readonly message: string | undefined;
}): Promise<void> {
  const guestEl = EmailRequestGuest({
    locale: input.locale,
    guestFirstName: input.guest.firstName,
    hotelName: input.hotelName,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    requestRef: input.requestRef,
  });
  const opsEl = EmailRequestOps({
    hotelName: input.hotelName,
    hotelId: input.hotelId,
    requestRef: input.requestRef,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    adults: input.adults,
    children: input.children,
    guestFirstName: input.guest.firstName,
    guestLastName: input.guest.lastName,
    guestEmail: input.guest.email,
    guestPhone: input.guest.phone,
    ...(input.guest.nationality !== undefined ? { guestNationality: input.guest.nationality } : {}),
    ...(input.roomPreference !== undefined ? { roomPreference: input.roomPreference } : {}),
    ...(input.message !== undefined ? { message: input.message } : {}),
  });

  const [guestHtml, guestText, opsHtml, opsText] = await Promise.all([
    renderEmailHtml(guestEl),
    renderEmailText(guestEl),
    renderEmailHtml(opsEl),
    renderEmailText(opsEl),
  ]);

  const brevo = { apiKey: env.BREVO_API_KEY };
  const sender = { email: env.BREVO_SENDER_EMAIL, name: env.BREVO_SENDER_NAME };

  const guestSubject =
    input.locale === 'en'
      ? `Your enquiry — ${input.hotelName} (${input.requestRef})`
      : `Votre demande — ${input.hotelName} (${input.requestRef})`;
  const opsSubject = `[CCT] Email request — ${input.hotelName} — ${input.requestRef}`;

  await Promise.allSettled([
    sendBrevoTransactionalEmail(brevo, {
      sender,
      to: [{ email: input.guest.email }],
      subject: guestSubject,
      htmlContent: guestHtml,
      ...(guestText.length > 0 ? { textContent: guestText } : {}),
    }),
    sendBrevoTransactionalEmail(brevo, {
      sender,
      to: [{ email: env.BREVO_INTERNAL_OPS_EMAIL }],
      subject: opsSubject,
      htmlContent: opsHtml,
      ...(opsText.length > 0 ? { textContent: opsText } : {}),
    }),
  ]);
}

/**
 * Server-side entry point for the email-mode booking tunnel (CDC §6,
 * skills: booking-engine + email-workflow-automation + security-engineering).
 *
 * Pipeline:
 *  1. Parse + validate input (Zod + domain `parseGuest`).
 *  2. Sliding-window rate-limit by IP and by guest email (Upstash).
 *  3. Idempotency reservation (Redis NX, 24h) keyed on stay+guest_email.
 *     A duplicate within the window returns the original request ref.
 *  4. Verify hotel is published and `booking_mode = 'email'`.
 *  5. Generate `CT-YYYYMMDD-XXXXX` ref via the domain port.
 *  6. Insert `booking_requests_email` row via service-role.
 *  7. Render React Email templates and send via Brevo (guest + ops).
 *  8. Finalise idempotency slot with the freshly-generated ref.
 *
 * Email send failures do not roll back the DB row — the operator queue
 * can still recover from `booking_requests_email`.
 */
export async function submitEmailBookingRequest(
  raw: unknown,
): Promise<Result<EmailBookingRequestSuccess, EmailBookingRequestError>> {
  const parsed = EmailBookingRequestSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return err({
      kind: 'validation',
      field: issue ? issue.path.join('.') : 'input',
      message: issue ? issue.message : 'invalid payload',
    });
  }

  const guestParsed = parseGuest(parsed.data.guest);
  if (!guestParsed.ok) {
    return err({
      kind: 'validation',
      field: `guest.${guestParsed.error.kind === 'guest_validation' ? guestParsed.error.field : 'unknown'}`,
      message:
        guestParsed.error.kind === 'guest_validation' ? guestParsed.error.message : 'invalid guest',
    });
  }
  const guest = guestParsed.value;
  const input = parsed.data;

  if (Date.parse(input.checkOut) <= Date.parse(input.checkIn)) {
    return err({
      kind: 'validation',
      field: 'checkOut',
      message: 'check-out must be after check-in',
    });
  }

  if (input.clientIp !== undefined) {
    const ipVerdict = await gateByIp(input.clientIp);
    if (!ipVerdict.ok) {
      return err({ kind: 'rate_limited', retryAfterSec: ipVerdict.retryAfterSec, scope: 'ip' });
    }
  }
  const emailVerdict = await gateByEmail(guest.email);
  if (!emailVerdict.ok) {
    return err({
      kind: 'rate_limited',
      retryAfterSec: emailVerdict.retryAfterSec,
      scope: 'email',
    });
  }

  const reservation = await reserveEmailRequestIdempotency({
    hotelId: input.hotelId,
    guestEmail: guest.email,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    adults: input.adults,
    children: input.children,
  });
  if (reservation.outcome.kind === 'existing') {
    return err({ kind: 'duplicate', requestRef: reservation.outcome.requestRef });
  }

  const supabase = getSupabaseAdminClient();

  const hotelLookup = await supabase
    .from('hotels')
    .select('id, name, booking_mode, is_published')
    .eq('id', input.hotelId)
    .maybeSingle();

  if (hotelLookup.error) {
    await releaseEmailRequestIdempotency(reservation.hash);
    return err({ kind: 'database', details: hotelLookup.error.message });
  }
  const hotel = hotelLookup.data as {
    id: string;
    name: string;
    booking_mode: string;
    is_published: boolean;
  } | null;
  if (!hotel || !hotel.is_published || hotel.booking_mode !== 'email') {
    await releaseEmailRequestIdempotency(reservation.hash);
    return err({ kind: 'hotel_not_bookable_by_email', hotelId: input.hotelId });
  }

  const refResult = generateBookingRef(serverClock, webCryptoRandomSource);
  if (!refResult.ok) {
    await releaseEmailRequestIdempotency(reservation.hash);
    return err({ kind: 'internal', details: refResult.error.kind });
  }
  const requestRef: string = refResult.value;

  const insert = await supabase
    .from('booking_requests_email')
    .insert({
      hotel_id: input.hotelId,
      submitted_by: input.userId ?? null,
      guest_firstname: guest.firstName,
      guest_lastname: guest.lastName,
      guest_email: guest.email,
      guest_phone: guest.phone,
      requested_checkin: input.checkIn,
      requested_checkout: input.checkOut,
      room_preference: input.roomPreference ?? null,
      message: input.message ?? null,
      status: 'new',
      request_ref: requestRef,
    })
    .select('id')
    .single();

  if (insert.error) {
    await releaseEmailRequestIdempotency(reservation.hash);
    return err({ kind: 'database', details: insert.error.message });
  }

  await sendEmails({
    locale: input.locale,
    guest,
    hotelName: hotel.name,
    hotelId: hotel.id,
    requestRef,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    adults: input.adults,
    children: input.children,
    roomPreference: input.roomPreference,
    message: input.message,
  });

  await finaliseEmailRequestIdempotency(reservation.hash, requestRef);

  return ok({ requestRef, hotelName: hotel.name, deduplicated: false });
}
