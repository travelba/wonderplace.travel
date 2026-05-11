import 'server-only';

import { z } from 'zod';

import { createSupabaseServerClient } from '@/lib/supabase/server';

const stringOrNull = z
  .string()
  .nullish()
  .transform((v) => (typeof v === 'string' ? v : null));

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

const EmailRequestRowSchema = z.object({
  id: z.string().uuid(),
  request_ref: stringOrNull,
  submitted_by: z.string().uuid().nullable(),
  guest_firstname: z.string(),
  guest_lastname: z.string(),
  guest_email: z.string(),
  requested_checkin: z.string(),
  requested_checkout: z.string(),
  status: z.enum(['new', 'in_progress', 'quoted', 'booked', 'declined']),
  created_at: z.string(),
  hotels: HotelMiniSchema,
});

export type EmailRequestListItem = z.infer<typeof EmailRequestRowSchema>;

const SELECT_COLUMNS =
  'id, request_ref, submitted_by, guest_firstname, guest_lastname, guest_email, requested_checkin, requested_checkout, status, created_at, hotels (id, name, name_en, slug, slug_en, city)';

/**
 * Lists email-mode enquiries submitted by the signed-in user. RLS
 * (`booking_requests_email_select`) scopes to `submitted_by = auth.uid()`
 * for customers, plus staff access. Anonymous enquiries (submitted_by null)
 * are never exposed here.
 */
export async function listUserEmailRequests(): Promise<readonly EmailRequestListItem[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('booking_requests_email')
    .select(SELECT_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error || !Array.isArray(data)) return [];

  const out: EmailRequestListItem[] = [];
  for (const row of data) {
    const parsed = EmailRequestRowSchema.safeParse(row);
    if (parsed.success) {
      out.push(parsed.data);
    } else if (process.env['NODE_ENV'] !== 'production') {
      console.warn('[listUserEmailRequests] parse error', parsed.error.flatten());
    }
  }
  return out;
}
