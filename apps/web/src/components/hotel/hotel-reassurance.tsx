import { getTranslations } from 'next-intl/server';

type ReassuranceIconKey = 'iata' | 'apst' | 'payment' | 'gdpr' | 'support';

interface HotelReassuranceProps {
  readonly locale: 'fr' | 'en';
}

/**
 * Pictograms for the reassurance cards. Stylised SVGs (not real
 * logos) — we cannot embed the IATA / Atout France / PCI marks
 * without explicit permission, and uploading real bitmap logos
 * adds Cloudinary load + license burden for a block that ships on
 * every fiche.
 *
 * Each glyph is a single 24×24 viewBox / 1.4-stroke path with
 * `currentColor` so the caller decides the tone. They sit inside
 * a circular `border` wrapper for the editorial palette.
 *
 * `iata`     — globe (international air-travel symbolism).
 * `apst`     — shield + check (financial guarantee).
 * `payment`  — card with a checkmark (secure payment).
 * `gdpr`     — lock with a circle of stars (EU / data
 *              sovereignty cue).
 * `support`  — speech bubble + person (concierge desk).
 *
 * A11y: rendered with `aria-hidden="true"` — the text label and
 * description in each card carry the meaning.
 */
const ICON_PATHS: Record<ReassuranceIconKey, string> = {
  iata: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z M3 12h18 M12 3a13.5 13.5 0 0 1 0 18 M12 3a13.5 13.5 0 0 0 0 18',
  apst: 'M12 3 4.5 6v6.25c0 4.25 3 8 7.5 9.25 4.5-1.25 7.5-5 7.5-9.25V6L12 3Z M8.5 12.5 11 15l4.5-5',
  payment:
    'M3.5 6.5h17a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z M2.5 10h19 M7 14.5h3 M14 14.5l1.5 1.5 3-3',
  gdpr: 'M7 11V8.5a5 5 0 0 1 10 0V11 M5.5 11h13v9.5h-13Z M9.5 15.5l1.5 1.5 3.5-3.5',
  support:
    'M21 12a8 8 0 0 1-12.5 6.65l-4.5 1.35 1.35-4.5A8 8 0 1 1 21 12Z M9.5 11h.01 M12 11h.01 M14.5 11h.01',
};

function ReassuranceIcon({ icon }: { icon: ReassuranceIconKey }): React.ReactElement {
  return (
    <span
      aria-hidden="true"
      className="border-border text-accent inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-white/60"
    >
      <svg
        viewBox="0 0 24 24"
        width={18}
        height={18}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        focusable="false"
      >
        <path d={ICON_PATHS[icon]} />
      </svg>
    </span>
  );
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

  const items: ReadonlyArray<{
    key: ReassuranceIconKey;
    label: string;
    detail: string;
  }> = [
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
          <li
            key={item.key}
            className="border-border bg-bg flex items-start gap-3 rounded-lg border p-4"
          >
            <ReassuranceIcon icon={item.key} />
            <div className="min-w-0">
              <p className="text-fg font-medium">{item.label}</p>
              <p className="text-muted mt-1 text-sm">{item.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
