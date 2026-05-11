import type { SearchLocale } from './index-names.js';

/**
 * Synonyms are seeded per locale on `hotels_<locale>` indices.
 *
 * NOTE — legal guardrails (skill: search-engineering): we **must not** equate
 * "palace" with "5 étoiles" / "5 stars": *Palace* is a regulated French
 * distinction (Atout France) and unaffiliated hotels cannot claim it via search
 * alias. Keep synonyms semantic, not commercial.
 */
export type SynonymEntry = {
  readonly objectID: string;
  readonly synonyms: readonly string[];
};

export const DEFAULT_HOTEL_SYNONYMS_FR: readonly SynonymEntry[] = [
  { objectID: 'fr-spa', synonyms: ['spa', 'soins', 'bien-être'] },
  { objectID: 'fr-piscine', synonyms: ['piscine', 'piscine intérieure', 'piscine chauffée'] },
  { objectID: 'fr-centre-ville', synonyms: ['centre-ville', 'centre', 'hyper-centre'] },
  { objectID: 'fr-bord-de-mer', synonyms: ['bord de mer', 'vue mer', 'front de mer'] },
  { objectID: 'fr-romantique', synonyms: ['romantique', 'lune de miel', 'séjour en couple'] },
  { objectID: 'fr-famille', synonyms: ['famille', 'en famille', 'enfants bienvenus'] },
];

export const DEFAULT_HOTEL_SYNONYMS_EN: readonly SynonymEntry[] = [
  { objectID: 'en-spa', synonyms: ['spa', 'wellness', 'wellbeing'] },
  { objectID: 'en-pool', synonyms: ['pool', 'swimming pool', 'indoor pool'] },
  { objectID: 'en-downtown', synonyms: ['downtown', 'city center', 'city centre'] },
  { objectID: 'en-seaside', synonyms: ['seaside', 'beachfront', 'oceanfront'] },
  { objectID: 'en-romantic', synonyms: ['romantic', 'honeymoon', 'couples retreat'] },
  { objectID: 'en-family', synonyms: ['family', 'family-friendly', 'kids welcome'] },
];

export function defaultHotelSynonyms(locale: SearchLocale): readonly SynonymEntry[] {
  return locale === 'fr' ? DEFAULT_HOTEL_SYNONYMS_FR : DEFAULT_HOTEL_SYNONYMS_EN;
}
