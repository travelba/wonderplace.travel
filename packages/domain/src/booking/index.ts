/**
 * Booking bounded context — public surface (skill: booking-engine, CDC §6).
 */
export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'no_show' | 'completed';

export type PaymentStatus = 'pending' | 'authorized' | 'captured' | 'cancelled' | 'refunded';

export type BookingChannel = 'amadeus' | 'little' | 'email';

export * from './booking-ref';
export * from './cancellation-policy';
export * from './draft';
export * from './errors';
export * from './guest';
export * from './idempotency';
export * from './offer';
export * from './state';
