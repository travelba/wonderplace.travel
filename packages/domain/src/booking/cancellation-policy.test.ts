import { describe, expect, it } from 'vitest';

import { fixedClock } from '../shared/clock';

import {
  isRefundableAt,
  normaliseCancellationPolicy,
  refundVerdictAt,
  type CancellationPolicy,
} from './cancellation-policy';

describe('normaliseCancellationPolicy', () => {
  it('rejects empty rawText', () => {
    const r = normaliseCancellationPolicy({ rawText: '   ', kind: 'non_refundable' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('cancellation_policy_unparseable');
  });

  it('requires freeUntil for free_until kind', () => {
    const r = normaliseCancellationPolicy({ rawText: 'Free cancellation', kind: 'free_until' });
    expect(r.ok).toBe(false);
  });

  it('builds free_until_then_partial policy with both deadlines', () => {
    const r = normaliseCancellationPolicy({
      rawText: 'Free until 2026-06-25; 50% after.',
      kind: 'free_until_then_partial',
      freeUntil: { deadline: '2026-06-25T18:00:00Z' },
      partialUntil: { deadline: '2026-06-29T18:00:00Z', penaltyFraction: 0.5 },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.kind).toBe('free_until_then_partial');
      expect(r.value.rawText).toBe('Free until 2026-06-25; 50% after.');
    }
  });
});

describe('refundVerdictAt', () => {
  const policy: CancellationPolicy = {
    kind: 'free_until_then_partial',
    rawText: 'Free until 2026-06-25; 50% after, until 2026-06-29.',
    freeUntil: { deadline: '2026-06-25T18:00:00Z' },
    partialUntil: { deadline: '2026-06-29T18:00:00Z', penaltyFraction: 0.5 },
  };

  it('full refund before free deadline', () => {
    const v = refundVerdictAt(policy, fixedClock('2026-06-20T10:00:00Z'));
    expect(v.kind).toBe('full');
  });

  it('partial refund between deadlines', () => {
    const v = refundVerdictAt(policy, fixedClock('2026-06-26T10:00:00Z'));
    expect(v.kind).toBe('partial');
    if (v.kind === 'partial') expect(v.penaltyFraction).toBe(0.5);
  });

  it('no refund past partial deadline', () => {
    const v = refundVerdictAt(policy, fixedClock('2026-06-30T10:00:00Z'));
    expect(v.kind).toBe('none');
  });

  it('non_refundable is always no refund', () => {
    const np: CancellationPolicy = { kind: 'non_refundable', rawText: 'Non refundable.' };
    expect(refundVerdictAt(np, fixedClock('2020-01-01T00:00:00Z')).kind).toBe('none');
  });

  it('isRefundableAt mirrors refundVerdictAt', () => {
    expect(isRefundableAt(policy, fixedClock('2026-06-20T10:00:00Z'))).toBe(true);
    expect(isRefundableAt(policy, fixedClock('2026-06-30T10:00:00Z'))).toBe(false);
  });
});
