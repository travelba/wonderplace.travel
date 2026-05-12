/**
 * Hotels bounded context — public surface.
 * Concrete entities and services arrive in Phase 2/4 along with the
 * data model and search engineering work.
 */
export type BookingMode = 'amadeus' | 'little' | 'email' | 'display_only';
export type HotelPriority = 'P0' | 'P1' | 'P2';

export const isBookable = (mode: BookingMode): boolean => mode === 'amadeus' || mode === 'little';
