import { describe, expect, it } from 'vitest';

import { canTransition, isTerminalState, transition } from './state';

describe('booking state machine', () => {
  it('advances one step at a time along the happy path', () => {
    expect(canTransition('idle', 'searching')).toBe(true);
    expect(canTransition('searching', 'results')).toBe(true);
    expect(canTransition('results', 'offer_locked')).toBe(true);
    expect(canTransition('offer_locked', 'guest_collected')).toBe(true);
    expect(canTransition('guest_collected', 'recap')).toBe(true);
    expect(canTransition('recap', 'payment_pending')).toBe(true);
    expect(canTransition('payment_pending', 'confirmed')).toBe(true);
  });

  it('forbids skipping ahead', () => {
    expect(canTransition('idle', 'results')).toBe(false);
    expect(canTransition('offer_locked', 'payment_pending')).toBe(false);
  });

  it('forbids rewinding', () => {
    expect(canTransition('payment_pending', 'recap')).toBe(false);
    expect(canTransition('results', 'searching')).toBe(false);
  });

  it('allows failure from any non-terminal state', () => {
    expect(canTransition('idle', 'failed')).toBe(true);
    expect(canTransition('offer_locked', 'failed')).toBe(true);
    expect(canTransition('payment_pending', 'failed')).toBe(true);
  });

  it('refuses transitions out of terminal states', () => {
    expect(canTransition('confirmed', 'failed')).toBe(false);
    expect(canTransition('failed', 'idle')).toBe(false);
    const r = transition('confirmed', 'searching');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('invalid_transition');
  });

  it('isTerminalState identifies confirmed and failed', () => {
    expect(isTerminalState('confirmed')).toBe(true);
    expect(isTerminalState('failed')).toBe(true);
    expect(isTerminalState('idle')).toBe(false);
  });
});
