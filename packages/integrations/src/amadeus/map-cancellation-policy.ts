import { normaliseCancellationPolicy, type CancellationPolicy } from '@cct/domain/booking';
import { err, ok, type Result } from '@cct/domain/shared';

import type { AmadeusError } from './errors.js';
import type { AmadeusOffer } from './types.js';

const round2 = (n: number): number => Math.round(n * 100) / 100;

const parseMoneyString = (raw: string | undefined): number | undefined => {
  if (raw === undefined) return undefined;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : undefined;
};

/**
 * Concatenates the verbatim text from each `cancellations[].description.text`
 * — preserved unchanged so the user sees exactly what Amadeus exposes
 * (CDC §6, skill: amadeus-gds). Falls back to a neutral default only when
 * no description is provided.
 */
function rawTextFor(offer: AmadeusOffer): string {
  const cancellations = offer.policies?.cancellations ?? [];
  const fragments: string[] = [];
  for (const c of cancellations) {
    const txt = c.description?.text;
    if (typeof txt === 'string' && txt.trim().length > 0) {
      fragments.push(txt.trim());
    }
  }
  if (fragments.length > 0) return fragments.join('\n');

  const paymentType = offer.policies?.paymentType;
  if (typeof paymentType === 'string' && paymentType.toLowerCase().includes('guarantee')) {
    return 'Cancellation policy: see hotel terms.';
  }
  return 'Cancellation policy not provided by the hotel.';
}

/**
 * Maps an Amadeus offer's policy block into a domain `CancellationPolicy`
 * via `normaliseCancellationPolicy`. The mapping is deliberately
 * conservative — anything we cannot classify with confidence is surfaced
 * as `mapping_failure` so the booking layer can degrade gracefully.
 */
export function amadeusPoliciesToCancellation(
  offer: AmadeusOffer,
): Result<CancellationPolicy, AmadeusError> {
  const rawText = rawTextFor(offer);
  const totalEuros = parseMoneyString(offer.price.total);
  const cancellations = offer.policies?.cancellations ?? [];

  if (cancellations.length === 0) {
    const paymentType = (offer.policies?.paymentType ?? '').toLowerCase();
    if (paymentType.includes('guarantee') || paymentType === '' || paymentType === 'hold') {
      return normaliseCancellationPolicy({ kind: 'non_refundable', rawText }).ok
        ? ok({ kind: 'non_refundable', rawText })
        : err({ kind: 'mapping_failure', details: 'cannot build non_refundable policy' });
    }
    return normaliseCancellationPolicy({ kind: 'non_refundable', rawText }).ok
      ? ok({ kind: 'non_refundable', rawText })
      : err({ kind: 'mapping_failure', details: 'cannot build non_refundable policy' });
  }

  const normalised = cancellations
    .map((c) => {
      const amount = parseMoneyString(c.amount);
      const deadline = typeof c.deadline === 'string' ? c.deadline : undefined;
      return { amount, deadline };
    })
    .filter((c): c is { amount: number | undefined; deadline: string } => c.deadline !== undefined);

  if (normalised.length === 0) {
    return ok({ kind: 'non_refundable', rawText });
  }

  normalised.sort((a, b) => Date.parse(a.deadline) - Date.parse(b.deadline));

  const fractionFor = (amount: number | undefined): number | undefined => {
    if (amount === undefined || totalEuros === undefined || totalEuros === 0) return undefined;
    return round2(amount / totalEuros);
  };

  if (normalised.length === 1) {
    const only = normalised[0];
    if (!only) {
      return err({ kind: 'mapping_failure', details: 'empty cancellations after filter' });
    }
    const fraction = fractionFor(only.amount);
    if (only.amount === undefined || only.amount === 0) {
      const built = normaliseCancellationPolicy({
        kind: 'free_until',
        rawText,
        freeUntil: { deadline: only.deadline },
      });
      if (!built.ok) {
        return err({ kind: 'mapping_failure', details: built.error.kind });
      }
      return ok(built.value);
    }
    const partialUntil =
      fraction !== undefined
        ? { deadline: only.deadline, penaltyFraction: fraction }
        : { deadline: only.deadline };
    const built = normaliseCancellationPolicy({
      kind: 'partial_refund_until',
      rawText,
      partialUntil,
    });
    if (!built.ok) {
      return err({ kind: 'mapping_failure', details: built.error.kind });
    }
    return ok(built.value);
  }

  const first = normalised[0];
  const second = normalised[1];
  if (!first || !second) {
    return err({ kind: 'mapping_failure', details: 'missing cancellations after sort' });
  }
  const partialFraction = fractionFor(second.amount);
  const partialDeadline =
    partialFraction !== undefined
      ? { deadline: second.deadline, penaltyFraction: partialFraction }
      : { deadline: second.deadline };
  const built = normaliseCancellationPolicy({
    kind: 'free_until_then_partial',
    rawText,
    freeUntil: { deadline: first.deadline },
    partialUntil: partialDeadline,
  });
  if (!built.ok) {
    return err({ kind: 'mapping_failure', details: built.error.kind });
  }
  return ok(built.value);
}
