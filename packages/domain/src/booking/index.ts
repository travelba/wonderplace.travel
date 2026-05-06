/**
 * Booking bounded context — public surface.
 * State machine, cancellation policy parser, and aggregates arrive in Phase 6.
 */
export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'cancelled'
  | 'no_show'
  | 'completed';

export type PaymentStatus =
  | 'pending'
  | 'authorized'
  | 'captured'
  | 'cancelled'
  | 'refunded';

export type BookingChannel = 'amadeus' | 'little' | 'email';
