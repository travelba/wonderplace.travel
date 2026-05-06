/**
 * Loyalty bounded context — public surface.
 * Tier rules, benefits calculation arrive in Phase 7.
 */
export type LoyaltyTier = 'free' | 'premium';

export interface LoyaltyBenefit {
  readonly code:
    | 'breakfast_for_2'
    | 'late_checkout_14h'
    | 'hotel_credit'
    | 'room_upgrade'
    | 'airport_transfer';
  readonly label: string;
  readonly subjectToAvailability?: boolean;
}
