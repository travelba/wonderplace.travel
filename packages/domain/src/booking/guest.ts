import { z } from 'zod';

import { err, ok, type Result } from '../shared/result';

import type { BookingError } from './errors';

/**
 * Lead guest captured at the `guest_collected` step (skill: booking-engine,
 * CDC §6). Email is normalised lowercase; phone is kept as the user typed it
 * but trimmed (Amadeus / Little tolerate either E.164 or local formats).
 */
export interface Guest {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly phone: string;
  readonly nationality?: string;
  readonly specialRequests?: string;
}

const guestSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  email: z.string().trim().toLowerCase().email().max(254),
  phone: z.string().trim().min(5).max(30),
  nationality: z
    .string()
    .trim()
    .length(2)
    .regex(/^[A-Z]{2}$/u, 'expected ISO 3166-1 alpha-2 uppercase')
    .optional(),
  specialRequests: z.string().trim().max(500).optional(),
});

/**
 * Parses + normalises a guest payload. Returns `guest_validation` errors
 * scoped to the first failing field — the route handler maps it to UI copy.
 */
export const parseGuest = (raw: unknown): Result<Guest, BookingError> => {
  const parsed = guestSchema.safeParse(raw);
  if (parsed.success) {
    const data = parsed.data;
    const out: Guest = {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone,
      ...(data.nationality !== undefined ? { nationality: data.nationality } : {}),
      ...(data.specialRequests !== undefined ? { specialRequests: data.specialRequests } : {}),
    };
    return ok(out);
  }
  const first = parsed.error.issues[0];
  const field = first ? first.path.join('.') : 'guest';
  const message = first ? first.message : 'invalid guest payload';
  return err({ kind: 'guest_validation', field, message });
};
