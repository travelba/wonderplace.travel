import { getTranslations } from 'next-intl/server';

import type { LocalisedPolicies, PaymentMethod } from '@/server/hotels/get-hotel-by-slug';

interface HotelPoliciesProps {
  readonly locale: 'fr' | 'en';
  readonly policies: LocalisedPolicies;
}

const PAYMENT_METHOD_ORDER: readonly PaymentMethod[] = [
  'visa',
  'mc',
  'amex',
  'diners',
  'jcb',
  'unionpay',
  'apple_pay',
  'google_pay',
  'cash',
  'bank_transfer',
];

function sortMethods(methods: readonly PaymentMethod[]): readonly PaymentMethod[] {
  return [...methods].sort(
    (a, b) => PAYMENT_METHOD_ORDER.indexOf(a) - PAYMENT_METHOD_ORDER.indexOf(b),
  );
}

/**
 * Policies section for the hotel detail page — CDC §2 bloc 14.
 *
 * Renders only the populated branches of the localized policy snapshot:
 * `<dl>` of facts (check-in/out, free-until cancellation, pet fee, child
 * age limit, deposit) + per-branch notes when present.
 *
 * Pure RSC. Caller decides whether to render the section
 * (typically: only when `hasAnyPolicy(policies)` is true).
 *
 * Each sub-block has an opinionated, sober layout meant to remain
 * scannable on mobile (avoids dense paragraphs) — aligned with the
 * accessibility skill (no expand/collapse, no client JS).
 */
export async function HotelPolicies({
  locale,
  policies,
}: HotelPoliciesProps): Promise<React.ReactElement | null> {
  const t = await getTranslations({ locale, namespace: 'hotelPage' });

  return (
    <section aria-labelledby="policies-title" className="mb-12">
      <h2 id="policies-title" className="text-fg mb-3 font-serif text-2xl">
        {t('sections.policies')}
      </h2>

      <div className="grid gap-4 md:grid-cols-2">
        {policies.checkIn !== null || policies.checkOut !== null ? (
          <article className="border-border bg-bg rounded-lg border p-4">
            <h3 className="text-fg mb-2 font-medium">{t('policies.checkInOutTitle')}</h3>
            <dl className="text-fg flex flex-col gap-1 text-sm">
              {policies.checkIn !== null ? (
                <div>
                  <dt className="text-muted">{t('policies.checkInLabel')}</dt>
                  <dd>
                    {policies.checkIn.until !== null
                      ? t('policies.checkInRange', {
                          from: policies.checkIn.from,
                          until: policies.checkIn.until,
                        })
                      : t('policies.checkInFrom', { from: policies.checkIn.from })}
                  </dd>
                </div>
              ) : null}
              {policies.checkOut !== null ? (
                <div>
                  <dt className="text-muted">{t('policies.checkOutLabel')}</dt>
                  <dd>{t('policies.checkOutUntil', { until: policies.checkOut.until })}</dd>
                </div>
              ) : null}
            </dl>
          </article>
        ) : null}

        {policies.cancellation !== null ? (
          <article className="border-border bg-bg rounded-lg border p-4">
            <h3 className="text-fg mb-2 font-medium">{t('policies.cancellationTitle')}</h3>
            {policies.cancellation.summary !== null ? (
              <p className="text-fg text-sm">{policies.cancellation.summary}</p>
            ) : null}
            {policies.cancellation.freeUntilHours !== null ? (
              <p className="text-muted mt-2 text-sm">
                {t('policies.cancellationFreeUntil', {
                  count: policies.cancellation.freeUntilHours,
                })}
              </p>
            ) : null}
            {policies.cancellation.penaltyAfter !== null ? (
              <p className="text-muted mt-2 text-sm">{policies.cancellation.penaltyAfter}</p>
            ) : null}
          </article>
        ) : null}

        {policies.pets !== null ? (
          <article className="border-border bg-bg rounded-lg border p-4">
            <h3 className="text-fg mb-2 font-medium">{t('policies.petsTitle')}</h3>
            <p className="text-fg text-sm">
              {policies.pets.allowed
                ? policies.pets.feeEur !== null && policies.pets.feeEur > 0
                  ? t('policies.petsAllowedFee', { amount: policies.pets.feeEur })
                  : t('policies.petsAllowedFree')
                : t('policies.petsNotAllowed')}
            </p>
            {policies.pets.notes !== null ? (
              <p className="text-muted mt-2 text-sm">{policies.pets.notes}</p>
            ) : null}
          </article>
        ) : null}

        {policies.children !== null ? (
          <article className="border-border bg-bg rounded-lg border p-4">
            <h3 className="text-fg mb-2 font-medium">{t('policies.childrenTitle')}</h3>
            <p className="text-fg text-sm">
              {policies.children.welcome
                ? t('policies.childrenWelcome')
                : t('policies.childrenNotWelcome')}
            </p>
            {policies.children.freeUnderAge !== null ? (
              <p className="text-muted mt-2 text-sm">
                {t('policies.childrenFreeUnder', { age: policies.children.freeUnderAge })}
              </p>
            ) : null}
            {policies.children.extraBedFeeEur !== null ? (
              <p className="text-muted mt-1 text-sm">
                {t('policies.childrenExtraBed', { amount: policies.children.extraBedFeeEur })}
              </p>
            ) : null}
            {policies.children.notes !== null ? (
              <p className="text-muted mt-2 text-sm">{policies.children.notes}</p>
            ) : null}
          </article>
        ) : null}

        {policies.payment !== null ? (
          <article className="border-border bg-bg rounded-lg border p-4 md:col-span-2">
            <h3 className="text-fg mb-2 font-medium">{t('policies.paymentTitle')}</h3>
            <ul className="flex flex-wrap gap-1.5">
              {sortMethods(policies.payment.methods).map((m) => (
                <li
                  key={m}
                  className="border-border bg-bg text-fg rounded-md border px-2 py-0.5 text-xs"
                >
                  {t(`policies.paymentMethod.${m}`)}
                </li>
              ))}
            </ul>
            {policies.payment.depositRequired !== null ? (
              <p className="text-muted mt-3 text-sm">
                {policies.payment.depositRequired
                  ? t('policies.paymentDepositRequired')
                  : t('policies.paymentNoDeposit')}
              </p>
            ) : null}
            {policies.payment.notes !== null ? (
              <p className="text-muted mt-2 text-sm">{policies.payment.notes}</p>
            ) : null}
          </article>
        ) : null}
      </div>
    </section>
  );
}
