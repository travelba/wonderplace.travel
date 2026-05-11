import { getTranslations } from 'next-intl/server';

interface HotelReassuranceProps {
  readonly locale: 'fr' | 'en';
}

/**
 * Reassurance block for the hotel detail page — CDC §2 bloc 13.
 *
 * Site-wide trust signals (not per-hotel data):
 *   - IATA accreditation (we sell GDS net rates)
 *   - APST financial guarantee
 *   - Amadeus Payments (PCI scoped-out, 3DS2)
 *   - GDPR / EU data residency
 *   - Concierge support 7 days a week
 *
 * Why site-wide rather than per-hotel: these are properties of the agency,
 * not the property. Encoding them as content in the page rather than data
 * lets them surface for every fiche without a migration backfill.
 *
 * Pure RSC, no client JS. Renders an a11y-friendly `<ul>` so screen
 * readers announce the items as a list (one of the few times we prefer
 * an icon-less, text-only treatment for clarity).
 *
 * Skill: structured-data-schema-org (the encompassing JSON-LD
 * `travelAgency` already covers our IATA accreditation; this UI block
 * surfaces the same facts to humans).
 */
export async function HotelReassurance({
  locale,
}: HotelReassuranceProps): Promise<React.ReactElement> {
  const t = await getTranslations({ locale, namespace: 'hotelPage.reassurance' });

  const items: ReadonlyArray<{ key: string; label: string; detail: string }> = [
    { key: 'iata', label: t('iataLabel'), detail: t('iataDetail') },
    { key: 'apst', label: t('apstLabel'), detail: t('apstDetail') },
    { key: 'payment', label: t('paymentLabel'), detail: t('paymentDetail') },
    { key: 'gdpr', label: t('gdprLabel'), detail: t('gdprDetail') },
    { key: 'support', label: t('supportLabel'), detail: t('supportDetail') },
  ];

  return (
    <section aria-labelledby="reassurance-title" className="mb-12">
      <h2 id="reassurance-title" className="text-fg mb-3 font-serif text-2xl">
        {t('title')}
      </h2>
      <ul
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        role="list"
        aria-label={t('listAria')}
      >
        {items.map((item) => (
          <li key={item.key} className="border-border bg-bg rounded-lg border p-4">
            <p className="text-fg font-medium">{item.label}</p>
            <p className="text-muted mt-1 text-sm">{item.detail}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
