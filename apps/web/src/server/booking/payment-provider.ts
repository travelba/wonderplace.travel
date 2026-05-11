import 'server-only';

import type { Offer } from '@cct/domain/booking';
import { err, ok, type Result } from '@cct/domain/shared';

/**
 * Payment-provider port (skill: payment-orchestration). Hides whether
 * payment is processed by Amadeus Payments, Adyen, or — temporarily —
 * a deterministic stub used while live credentials are pending.
 *
 * Lifecycle:
 *   1. `initiate(offer)` → returns a session reference and either an
 *      iframe URL (real provider) or a `mode === 'stub'` marker (no
 *      iframe; UI renders an explicit "confirm test payment" button).
 *   2. `capture(sessionRef)` → finalises the payment. Real providers
 *      typically trigger this from a server-to-server webhook; the stub
 *      runs synchronously when the user clicks the confirm button.
 */
export type PaymentInitiation =
  | { readonly mode: 'stub'; readonly sessionRef: string }
  | { readonly mode: 'live'; readonly sessionRef: string; readonly iframeUrl: string };

export type PaymentCaptureResult = {
  readonly paymentRef: string;
  readonly capturedAtIso: string;
};

export type PaymentError =
  | { readonly kind: 'declined'; readonly reason?: string }
  | { readonly kind: 'expired_session' }
  | { readonly kind: 'unknown_session'; readonly sessionRef: string }
  | { readonly kind: 'upstream'; readonly details: string };

export interface PaymentProvider {
  readonly mode: 'stub' | 'live';
  initiate(offer: Offer, draftId: string): Promise<Result<PaymentInitiation, PaymentError>>;
  capture(sessionRef: string): Promise<Result<PaymentCaptureResult, PaymentError>>;
}

const STUB_PREFIX = 'STUB-PAY-';

function newStubRef(): string {
  return `${STUB_PREFIX}${crypto.randomUUID()}`;
}

/**
 * Deterministic stub provider. Successful capture is the only path —
 * decline / 3DS / chargeback simulation will be added once the live
 * Amadeus Payments integration lands.
 */
export const stubPaymentProvider: PaymentProvider = {
  mode: 'stub',
  async initiate(_offer, _draftId) {
    return ok({ mode: 'stub', sessionRef: newStubRef() });
  },
  async capture(sessionRef) {
    if (!sessionRef.startsWith(STUB_PREFIX)) {
      return err({ kind: 'unknown_session', sessionRef });
    }
    return ok({ paymentRef: sessionRef, capturedAtIso: new Date().toISOString() });
  },
};

/**
 * Active provider for the running process. Today: always stub (no live
 * Amadeus / Adyen credentials provisioned yet). Once available, swap in
 * a live implementation here and gate behind `env.PAYMENT_PROVIDER_MODE`.
 */
export function getPaymentProvider(): PaymentProvider {
  return stubPaymentProvider;
}
