import { describe, expect, it } from 'vitest';

import { fixedClock } from '../shared/clock';
import { fixedRandomSource } from '../shared/random';

import { generateBookingRef } from './booking-ref';

describe('generateBookingRef', () => {
  it('formats CT-YYYYMMDD-XXXXX from UTC date', () => {
    const clock = fixedClock('2026-05-11T08:30:00Z');
    const random = fixedRandomSource('AAAAAA');
    const r = generateBookingRef(clock, random);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toMatch(/^CT-20260511-[A-Z0-9]{5}$/);
    }
  });

  it('is deterministic given the same clock + random seed', () => {
    const clock = fixedClock('2026-01-02T10:00:00Z');
    const random1 = fixedRandomSource('seed-A');
    const random2 = fixedRandomSource('seed-A');
    const a = generateBookingRef(clock, random1);
    const b = generateBookingRef(clock, random2);
    expect(a).toEqual(b);
  });

  it('reports invariant_violated when the RNG returns a bad suffix', () => {
    const clock = fixedClock('2026-05-11T08:30:00Z');
    const bad = {
      randomAlphanumeric: () => 'lower', // lowercase ⇒ invalid
    };
    const r = generateBookingRef(clock, bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('invariant_violated');
  });
});
