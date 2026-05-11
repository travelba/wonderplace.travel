import type { TravelAgency } from 'schema-dts';

/** TravelAgency without the bare-IRI string union (schema-dts hybrid type). */
export type TravelAgencyNode = Exclude<TravelAgency, string>;

export interface TravelAgencyJsonLdInput {
  readonly name: string;
  readonly url: string;
  readonly logoUrl?: string;
  readonly description?: string;
  readonly contactEmail?: string;
  readonly contactPhone?: string;
  readonly iataCode?: string;
  readonly sameAs?: readonly string[];
}

/**
 * TravelAgency JSON-LD for the home page / agency footer.
 * IATA accreditation is signalled via `award` (Google supports free-form text).
 */
export const travelAgencyJsonLd = (input: TravelAgencyJsonLdInput): TravelAgencyNode => {
  const out: TravelAgencyNode = {
    '@type': 'TravelAgency',
    name: input.name,
    url: input.url,
  };

  if (input.logoUrl !== undefined) {
    out.logo = input.logoUrl;
    out.image = input.logoUrl;
  }
  if (input.description !== undefined) {
    out.description = input.description;
  }
  if (input.iataCode !== undefined) {
    out.award = `IATA accredited agency (${input.iataCode})`;
  }
  if (input.contactEmail !== undefined || input.contactPhone !== undefined) {
    out.contactPoint = {
      '@type': 'ContactPoint',
      contactType: 'customer service',
      ...(input.contactEmail !== undefined ? { email: input.contactEmail } : {}),
      ...(input.contactPhone !== undefined ? { telephone: input.contactPhone } : {}),
    };
  }
  if (input.sameAs !== undefined && input.sameAs.length > 0) {
    out.sameAs = [...input.sameAs];
  }

  return out;
};
