import { err, ok, type Result } from '../shared/result';

import { invalidTransition, type BookingError } from './errors';

/**
 * Booking funnel state (skill: booking-engine). Pure state values; the
 * full draft aggregate (carrying offer + guest + payment data) lives in
 * `./draft.ts` and embeds this discriminator.
 *
 * Transitions (paid modes — `amadeus` / `little`):
 *
 *   idle → searching → results → offer_locked → guest_collected → recap
 *     → payment_pending → confirmed
 *                        ↘ failed
 *
 * Transitions (`email` / `display_only`):
 *
 *   idle → searching → results → offer_locked → guest_collected → recap
 *     → confirmed
 *                        ↘ failed
 *
 * Any non-terminal state may transition to `failed` (offer expired,
 * payment declined, upstream error). `confirmed` and `failed` are terminal.
 */
export type BookingState =
  | 'idle'
  | 'searching'
  | 'results'
  | 'offer_locked'
  | 'guest_collected'
  | 'recap'
  | 'payment_pending'
  | 'confirmed'
  | 'failed';

/**
 * Booking modes (CDC §6). Defined here — not in `draft.ts` — because the
 * state machine itself depends on the mode (paid modes require a
 * payment_pending step; off-network modes skip it).
 */
export type BookingMode = 'amadeus' | 'little' | 'email' | 'display_only';

const PAID_HAPPY_PATH: readonly BookingState[] = [
  'idle',
  'searching',
  'results',
  'offer_locked',
  'guest_collected',
  'recap',
  'payment_pending',
  'confirmed',
];

const FREE_HAPPY_PATH: readonly BookingState[] = [
  'idle',
  'searching',
  'results',
  'offer_locked',
  'guest_collected',
  'recap',
  'confirmed',
];

const happyPathFor = (mode: BookingMode | undefined): readonly BookingState[] => {
  if (mode === 'email' || mode === 'display_only') return FREE_HAPPY_PATH;
  return PAID_HAPPY_PATH;
};

const TERMINAL_STATES: ReadonlySet<BookingState> = new Set(['confirmed', 'failed']);

export const isTerminalState = (s: BookingState): boolean => TERMINAL_STATES.has(s);

/**
 * Returns `ok(to)` if the transition is legal, `err(invalid_transition)` otherwise.
 *
 * Rules:
 *  - `to === 'failed'` is allowed from any non-terminal state.
 *  - Otherwise transitions must step **exactly one position** forward along
 *    the mode-specific happy path (no skipping, no rewinding).
 *
 * The `mode` argument is optional for backwards compatibility — when
 * omitted, paid-mode rules apply (the default expected by Amadeus / Little
 * tunnels).
 */
export const transition = (
  from: BookingState,
  to: BookingState,
  mode?: BookingMode,
): Result<BookingState, BookingError> => {
  if (isTerminalState(from)) {
    return err(invalidTransition(from, to));
  }
  if (to === 'failed') {
    return ok(to);
  }
  const path = happyPathFor(mode);
  const fromIdx = path.indexOf(from);
  const toIdx = path.indexOf(to);
  if (fromIdx === -1 || toIdx === -1) {
    return err(invalidTransition(from, to));
  }
  if (toIdx !== fromIdx + 1) {
    return err(invalidTransition(from, to));
  }
  return ok(to);
};

export const canTransition = (from: BookingState, to: BookingState, mode?: BookingMode): boolean =>
  transition(from, to, mode).ok;
