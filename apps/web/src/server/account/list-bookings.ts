import 'server-only';

import { z } from 'zod';

import { createSupabaseServerClient } from '@/lib/supabase/server';

const stringOrNull = z
  .string()
  .nullish()
  .transform((v) => (typeof v === 'string' ? v : null));

const numericOrNull = z
  .union([z.number(), z.string()])
  .nullish()
  .transform((v) => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  });

const HotelMiniSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    name_en: stringOrNull,
    slug: z.string(),
    slug_en: stringOrNull,
    city: z.string(),
  })
  .nullable();

const BookingRowSchema = z.object({
  id: z.string().uuid(),
  booking_ref: z.string(),
  user_id: z.string().uuid().nullable(),
  guest_firstname: z.string(),
  guest_lastname: z.string(),
  guest_email: z.string(),
  checkin_date: z.string(),
  checkout_date: z.string(),
  nights: z.number().int().nullable(),
  adults: z.number().int(),
  children: z.number().int(),
  total_price: numericOrNull,
  currency: z.string(),
  status: z.enum(['pending', 'confirmed', 'cancelled', 'no_show', 'completed']),
  payment_status: z.enum(['pending', 'authorized', 'captured', 'cancelled', 'refunded']),
  booking_channel: z.enum(['amadeus', 'little', 'email']),
  created_at: z.string(),
  hotels: HotelMiniSchema,
});

export type BookingListItem = z.infer<typeof BookingRowSchema>;

const SELECT_COLUMNS =
  'id, booking_ref, user_id, guest_firstname, guest_lastname, guest_email, checkin_date, checkout_date, nights, adults, children, total_price, currency, status, payment_status, booking_channel, created_at, hotels (id, name, name_en, slug, slug_en, city)';

/**
 * Lists the signed-in user's bookings. Anon-key client + RLS
 * (`bookings_select_own`) automatically scopes to `user_id = auth.uid()`.
 *
 * Returns `[]` when no session, no rows, or a parse failure (defensive).
 */
export async function listUserBookings(): Promise<readonly BookingListItem[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('bookings')
    .select(SELECT_COLUMNS)
    .order('checkin_date', { ascending: false })
    .limit(50);

  if (error || !Array.isArray(data)) return [];

  const out: BookingListItem[] = [];
  for (const row of data) {
    const parsed = BookingRowSchema.safeParse(row);
    if (parsed.success) {
      out.push(parsed.data);
    } else if (process.env['NODE_ENV'] !== 'production') {
      console.warn('[listUserBookings] parse error', parsed.error.flatten());
    }
  }
  return out;
}
