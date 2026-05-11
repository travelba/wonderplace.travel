import type { Clock } from '../shared/clock';
import { err, ok, type Result } from '../shared/result';

import type { BookingError } from './errors';

/**
 * Cancellation policy (skill: booking-engine, CDC §6). The **raw text** is
 * authoritative and surfaced verbatim to users; this module only parses
 * structured deadlines for refundability checks (e.g. "is it refundable
 * right now?"). It **never** rewrites the text — callers display
 * `rawText` unchanged.
 *
 * Deadlines are normalised to ISO-8601 (UTC) timestamps.
 */
export type CancellationPolicyKind =
  | 'non_refundable'
  | 'free_until'
  | 'partial_refund_until'
  | 'free_until_then_partial';

export interface CancellationDeadline {
  /** ISO-8601 UTC timestamp; before this instant a refund applies. */
  readonly deadline: string;
  /** Optional fraction `0–1` retained by the hotel after the deadline (only meaningful for `partial_refund_until` / `free_until_then_partial`). */
  readonly penaltyFraction?: number;
}

export type CancellationPolicy =
  | {
      readonly kind: 'non_refundable';
      readonly rawText: string;
    }
  | {
      readonly kind: 'free_until';
      readonly rawText: string;
      readonly freeUntil: CancellationDeadline;
    }
  | {
      readonly kind: 'partial_refund_until';
      readonly rawText: string;
      readonly partialUntil: CancellationDeadline;
    }
  | {
      readonly kind: 'free_until_then_partial';
      readonly rawText: string;
      readonly freeUntil: CancellationDeadline;
      readonly partialUntil: CancellationDeadline;
    };

const isoToMs = (iso: string): number | undefined => {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : undefined;
};

/**
 * Refund verdict at a given clock instant:
 *  - `full`  → fully refundable
 *  - `partial(fraction)` → refundable minus a kept fraction
 *  - `none`  → no refund possible
 */
export type RefundVerdict =
  | { readonly kind: 'full' }
  | { readonly kind: 'partial'; readonly penaltyFraction: number }
  | { readonly kind: 'none' };

const FULL: RefundVerdict = { kind: 'full' };
const NONE: RefundVerdict = { kind: 'none' };

export const refundVerdictAt = (policy: CancellationPolicy, clock: Clock): RefundVerdict => {
  const now = clock.now().getTime();
  switch (policy.kind) {
    case 'non_refundable':
      return NONE;
    case 'free_until': {
      const deadline = isoToMs(policy.freeUntil.deadline);
      if (deadline === undefined) return NONE;
      return now <= deadline ? FULL : NONE;
    }
    case 'partial_refund_until': {
      const deadline = isoToMs(policy.partialUntil.deadline);
      if (deadline === undefined) return NONE;
      if (now > deadline) return NONE;
      return {
        kind: 'partial',
        penaltyFraction: policy.partialUntil.penaltyFraction ?? 0,
      };
    }
    case 'free_until_then_partial': {
      const free = isoToMs(policy.freeUntil.deadline);
      const partial = isoToMs(policy.partialUntil.deadline);
      if (free === undefined || partial === undefined) return NONE;
      if (now <= free) return FULL;
      if (now <= partial) {
        return {
          kind: 'partial',
          penaltyFraction: policy.partialUntil.penaltyFraction ?? 0,
        };
      }
      return NONE;
    }
  }
};

/**
 * Convenience: legal flag exposed in `<button disabled>` checks.
 */
export const isRefundableAt = (policy: CancellationPolicy, clock: Clock): boolean =>
  refundVerdictAt(policy, clock).kind !== 'none';

export interface NormaliseInput {
  readonly rawText: string;
  readonly kind: CancellationPolicyKind;
  readonly freeUntil?: CancellationDeadline;
  readonly partialUntil?: CancellationDeadline;
}

/**
 * Builder used by adapters (`packages/integrations/amadeus|little-hotelier`)
 * to construct a normalised `CancellationPolicy`. Pre-validates that the
 * deadlines required by `kind` are provided; returns `Result` rather than
 * throwing so the booking layer can route the error to telemetry.
 */
export const normaliseCancellationPolicy = (
  input: NormaliseInput,
): Result<CancellationPolicy, BookingError> => {
  const rawText = input.rawText.trim();
  if (rawText.length === 0) {
    return err({
      kind: 'cancellation_policy_unparseable',
      detail: 'rawText is empty',
    });
  }

  switch (input.kind) {
    case 'non_refundable':
      return ok({ kind: 'non_refundable', rawText });
    case 'free_until':
      if (input.freeUntil === undefined) {
        return err({
          kind: 'cancellation_policy_unparseable',
          detail: 'free_until requires freeUntil',
        });
      }
      return ok({ kind: 'free_until', rawText, freeUntil: input.freeUntil });
    case 'partial_refund_until':
      if (input.partialUntil === undefined) {
        return err({
          kind: 'cancellation_policy_unparseable',
          detail: 'partial_refund_until requires partialUntil',
        });
      }
      return ok({
        kind: 'partial_refund_until',
        rawText,
        partialUntil: input.partialUntil,
      });
    case 'free_until_then_partial':
      if (input.freeUntil === undefined || input.partialUntil === undefined) {
        return err({
          kind: 'cancellation_policy_unparseable',
          detail: 'free_until_then_partial requires both deadlines',
        });
      }
      return ok({
        kind: 'free_until_then_partial',
        rawText,
        freeUntil: input.freeUntil,
        partialUntil: input.partialUntil,
      });
  }
};
