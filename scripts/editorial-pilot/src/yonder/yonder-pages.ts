/**
 * yonder-pages.ts — list of yonder.fr pages to scrape for the FR hotel catalog.
 *
 * Strategy:
 *   - Fixed allowlist of "Tops" + cityguides + thematic selections, all FR.
 *   - Each page tagged with its dominant classification ('palace' | '5-etoiles' |
 *     '4-etoiles' | 'theme'), used to populate `classifications[]` on each
 *     extracted hotel.
 *   - We deliberately skip international Tops (Croatia, Australia, …) and
 *     Yonder destinations not centred on France (e.g. /destinations/marrakech).
 *
 * Cost (Tavily Extract advanced): 2 credits / URL → ~30 credits for the full
 * sweep (well within the 1000 credits/month free tier).
 */

export type YonderPageScope =
  | 'palace'
  | '5-etoiles'
  | '4-etoiles'
  | 'paris-cityguide'
  | 'cote-azur'
  | 'provence'
  | 'corse'
  | 'champagne'
  | 'bord-de-mer'
  | 'chateau'
  | 'bien-etre'
  | 'mixed-france';

export interface YonderPage {
  /** Public URL on yonder.fr. Must be France-centric. */
  readonly url: string;
  /** Short human label for logs. */
  readonly label: string;
  /** Dominant classification — propagated as a tag on every hotel found. */
  readonly scope: YonderPageScope;
  /** Optional region hint when the page itself focuses on one region. */
  readonly regionHint?: string;
}

/**
 * Pages to scrape — ordered by priority (palaces & top 30 first, easier QA).
 * Add a URL here when you discover a new yonder list page that mentions FR
 * hotels not yet captured.
 */
export const YONDER_PAGES: readonly YonderPage[] = [
  {
    url: 'https://www.yonder.fr/les-tops/hotels/les-plus-beaux-palaces-de-france',
    label: 'Plus beaux palaces de France',
    scope: 'palace',
  },
  {
    url: 'https://www.yonder.fr/les-tops/hotels/les-30-plus-beaux-hotels-en-france',
    label: 'Les 30 plus beaux hôtels de France',
    scope: 'mixed-france',
  },
  {
    url: 'https://www.yonder.fr/les-tops/hotels/les-plus-beaux-hotels-5-etoiles-France',
    label: 'Plus beaux hôtels 5 étoiles de France',
    scope: '5-etoiles',
  },
  {
    url: 'https://www.yonder.fr/les-tops/hotels/les-plus-beaux-hotels-4-etoiles-de-france',
    label: 'Plus beaux hôtels 4 étoiles de France',
    scope: '4-etoiles',
  },
  {
    url: 'https://www.yonder.fr/les-tops/hotels/hotel-bord-de-mer-les-meilleurs-hotels-en-france',
    label: 'Hôtels bord de mer France',
    scope: 'bord-de-mer',
  },
  {
    url: 'https://www.yonder.fr/cityguides/paris/hotels',
    label: '(City)guide Paris — hôtels',
    scope: 'paris-cityguide',
    regionHint: 'Île-de-France',
  },
  {
    url: 'https://www.yonder.fr/hotels/hotels-du-mois/les-meilleurs-hotels-5-etoiles-a-paris-france',
    label: 'Meilleurs 5 étoiles à Paris',
    scope: '5-etoiles',
    regionHint: 'Île-de-France',
  },
  {
    url: 'https://www.yonder.fr/hotels/hotels-du-mois/plus-beaux-hotels-de-corse-meilleures-adresses-luxe',
    label: 'Plus beaux hôtels de Corse',
    scope: 'corse',
    regionHint: 'Corse',
  },
  {
    url: 'https://www.yonder.fr/hotels/hotels-du-mois/plus-beaux-hotels-de-provences-nos-meilleures-adresses',
    label: 'Plus beaux hôtels de Provence',
    scope: 'provence',
    regionHint: "Provence-Alpes-Côte d'Azur",
  },
  {
    url: 'https://www.yonder.fr/hotels/hotels-du-mois/hotel-cote-d-azur-france-meilleurs-hotels-luxe-charme-palaces',
    label: "Meilleurs hôtels Côte d'Azur",
    scope: 'cote-azur',
    regionHint: "Provence-Alpes-Côte d'Azur",
  },
  {
    url: 'https://www.yonder.fr/les-tops/hotels/dormir-dans-un-chateau-meilleurs-hotels-chateau-en-france',
    label: 'Dormir dans un château — meilleurs hôtels',
    scope: 'chateau',
  },
  {
    url: 'https://www.yonder.fr/les-tops/hotels/hotels-de-reve-pour-un-weekend-bien-etre',
    label: 'Hôtels de rêve pour un week-end bien-être',
    scope: 'bien-etre',
  },
  // Paris-specific pages (palaces Paris, chic Paris, hôtels par quartier).
  {
    url: 'https://www.yonder.fr/les-tops/hotels/plus-beaux-palaces-paris',
    label: 'Plus beaux palaces de Paris',
    scope: 'palace',
    regionHint: 'Île-de-France',
  },
  {
    url: 'https://www.yonder.fr/les-tops/hotels/hotel-chic-paris-selection',
    label: 'Hôtels chic à Paris',
    scope: '5-etoiles',
    regionHint: 'Île-de-France',
  },
  // Mountain / ski / Alps — covers Courchevel, Méribel, Megève palaces.
  {
    url: 'https://www.yonder.fr/les-tops/hotels/plus-beaux-chalets-luxe-megeve',
    label: 'Plus beaux chalets ultra-luxe de Megève',
    scope: '5-etoiles',
    regionHint: 'Auvergne-Rhône-Alpes',
  },
  {
    url: 'https://www.yonder.fr/les-tops/hotels/plus-beaux-hotels-courchevel-luxe-charme',
    label: 'Plus beaux hôtels de Courchevel',
    scope: '5-etoiles',
    regionHint: 'Auvergne-Rhône-Alpes',
  },
  {
    url: 'https://www.yonder.fr/les-tops/hotels/les-plus-beaux-hotels-de-montagne-du-monde',
    label: 'Plus beaux hôtels de montagne (FR-heavy)',
    scope: '5-etoiles',
  },
  // Relais & Châteaux selection (FR-heavy international list).
  {
    url: 'https://www.yonder.fr/les-tops/hotels/plus-beaux-relais-chateaux-du-monde',
    label: 'Plus beaux Relais & Châteaux du monde',
    scope: 'chateau',
  },
];
