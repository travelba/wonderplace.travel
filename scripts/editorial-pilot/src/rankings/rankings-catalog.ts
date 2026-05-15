/**
 * Editorial rankings catalog — drives the `/classement/[slug]` route.
 *
 * Each ranking has:
 *   - a `slug` (URL-stable)
 *   - a `kind` (best_of / awarded / thematic / geographic) that drives
 *     the JSON-LD graph + the editorial framing
 *   - an `eligibility` predicate evaluated against `hotels-catalog.json`
 *     to compute the candidate set BEFORE the LLM chooses the order
 *   - editorial `keywords` that anchor the LLM justification
 *
 * Adding a new ranking → add an entry here. The pipeline will pick it
 * up automatically.
 */

import type { HotelCatalogRow } from './load-hotels-catalog.js';

export type RankingKind = 'best_of' | 'awarded' | 'thematic' | 'geographic';

export interface RankingSeed {
  readonly slug: string;
  readonly titleFr: string;
  readonly titleEn: string;
  readonly kind: RankingKind;
  /** Target ranking length (LLM picks N hotels from the eligibility set). */
  readonly targetLength: number;
  /** Editorial keywords / theme anchors. */
  readonly keywordsFr: readonly string[];
  /** Predicate selecting the eligible candidates from the full catalog. */
  readonly eligibility: (h: HotelCatalogRow) => boolean;
  /** Optional Cloudinary hero `public_id`. */
  readonly heroImage?: string;
}

const PARIS_CITIES = new Set(['paris']);
const COTE_AZUR_CITIES = new Set([
  'cannes',
  'nice',
  'antibes',
  "cap d'antibes",
  'saint-jean-cap-ferrat',
  'cap-ferrat',
  'menton',
  'eze',
  'saint-tropez',
  'ramatuelle',
  'monaco',
  'monte-carlo',
  'beaulieu-sur-mer',
  'roquebrune-cap-martin',
]);
const ALPES_CITIES = new Set([
  'courchevel',
  'megève',
  'megeve',
  "val d'isère",
  "val d'isere",
  'chamonix',
  'chamonix-mont-blanc',
  'tignes',
  'val thorens',
  'avoriaz',
  'morzine',
]);
const COAST_CITIES = new Set([
  'biarritz',
  'deauville',
  'cannes',
  'nice',
  'antibes',
  "cap d'antibes",
  'saint-jean-cap-ferrat',
  'cap-ferrat',
  'saint-tropez',
  'ramatuelle',
  'menton',
  'eze',
  'beaulieu-sur-mer',
  'porto-vecchio',
  'calvi',
  'ajaccio',
  'bonifacio',
]);
const VINEYARD_CITIES = new Set([
  'bordeaux',
  'martillac',
  'saint-emilion',
  'saint-émilion',
  'pauillac',
  'reims',
  'épernay',
  'epernay',
  'beaune',
]);

const lc = (s: string): string => s.toLowerCase();

export const RANKINGS: readonly RankingSeed[] = [
  {
    slug: 'meilleurs-palaces-france',
    titleFr: 'Les meilleurs Palaces de France',
    titleEn: 'The best Palaces in France',
    kind: 'best_of',
    targetLength: 12,
    keywordsFr: [
      'Palaces distinction Atout France',
      "icônes hôtelières françaises : Paris, Côte d'Azur, Alpes, Provence, Bordeaux",
      'critères : patrimoine, gastronomie étoilée, services, spa, vue, intimité',
      'tradition + modernité, art de vivre français',
    ],
    eligibility: (h) => h.is_palace && h.stars === 5,
  },
  {
    slug: 'meilleurs-palaces-paris',
    titleFr: 'Les plus beaux Palaces de Paris',
    titleEn: 'The most beautiful Palaces in Paris',
    kind: 'geographic',
    targetLength: 10,
    keywordsFr: [
      "Triangle d'or — Avenue Montaigne, rue Saint-Honoré, Champs-Élysées",
      'tradition parisienne — Plaza Athénée, Bristol, Meurice, Ritz, Crillon',
      'patrimoine architectural haussmannien',
      'gastronomie : Alléno, Ducasse, Pic, Lignac',
    ],
    eligibility: (h) => h.is_palace && PARIS_CITIES.has(lc(h.city)),
  },
  {
    slug: 'meilleurs-palaces-cote-d-azur',
    titleFr: "Les plus beaux Palaces de la Côte d'Azur",
    titleEn: 'The most beautiful Palaces on the French Riviera',
    kind: 'geographic',
    targetLength: 10,
    keywordsFr: [
      'Riviera française — de Saint-Tropez à Menton',
      'climat méditerranéen, plages, yachting',
      'Hôtel du Cap-Eden-Roc, Grand-Hôtel du Cap-Ferrat, La Réserve Ramatuelle',
      'Cannes (Festival), Monaco (Grand Prix), Nice (carnaval)',
    ],
    eligibility: (h) => h.is_palace && COTE_AZUR_CITIES.has(lc(h.city)),
  },
  {
    slug: 'meilleurs-palaces-alpes',
    titleFr: 'Les plus beaux Palaces des Alpes',
    titleEn: 'The most beautiful Palaces in the French Alps',
    kind: 'geographic',
    targetLength: 10,
    keywordsFr: [
      "stations 5* : Courchevel 1850, Megève, Val d'Isère, Chamonix",
      'ski-in / ski-out, hélicoptère, dameuse de nuit',
      'Les Airelles, Cheval Blanc Courchevel, Le K2, Six Senses, Four Seasons Megève',
      'saison hivernale 15 décembre - 15 avril',
    ],
    eligibility: (h) => h.is_palace && ALPES_CITIES.has(lc(h.city)),
  },
  {
    slug: 'palaces-bord-de-mer',
    titleFr: 'Les plus beaux Palaces en bord de mer',
    titleEn: 'The most beautiful seaside Palaces',
    kind: 'thematic',
    targetLength: 10,
    keywordsFr: [
      'vue mer Méditerranée ou Atlantique',
      'plages privées, ponton, paddle, voilier',
      'Eden-Roc, Cap-Ferrat, Saint-Tropez, Biarritz, Corse',
      'saison estivale, beach club, terrasses',
    ],
    eligibility: (h) => h.is_palace && COAST_CITIES.has(lc(h.city)),
  },
  {
    slug: 'palaces-vignobles',
    titleFr: 'Les plus beaux Palaces et Resorts au cœur des vignobles',
    titleEn: 'The most beautiful Palaces and Resorts in the vineyards',
    kind: 'thematic',
    targetLength: 8,
    keywordsFr: [
      'œnotourisme — Médoc, Saint-Émilion, Pessac-Léognan, Champagne, Provence',
      'Les Sources de Caudalie (Martillac), Royal Champagne, Domaine Les Crayères',
      'cave de dégustation, masterclass sommelier, vendanges (septembre-octobre)',
      'cuisine accord mets-vins',
    ],
    eligibility: (h) => h.is_palace && VINEYARD_CITIES.has(lc(h.city)),
  },
  {
    slug: 'palaces-spa-detente',
    titleFr: 'Les plus beaux Palaces avec spa pour une retraite bien-être',
    titleEn: 'The finest Palaces with spa for a wellness retreat',
    kind: 'thematic',
    targetLength: 10,
    keywordsFr: [
      'spas signature : Guerlain, Dior, La Mer, Sisley, Valmont, Codage, Augustinus Bader',
      'soins ressourçants, hammam, sauna, piscine intérieure / extérieure',
      'yoga, méditation, retraite digitale',
      'art de vivre wellness français',
    ],
    eligibility: (h) => h.is_palace,
  },
  {
    slug: 'palaces-romantiques',
    titleFr: 'Les Palaces les plus romantiques de France',
    titleEn: 'The most romantic Palaces in France',
    kind: 'thematic',
    targetLength: 10,
    keywordsFr: [
      'lune de miel, escapade en amoureux, anniversaire de mariage',
      'suites avec vue, terrasse privée, jacuzzi, cheminée',
      'dîners aux chandelles, restaurants étoilés',
      "Provence, Côte d'Azur, Paris, châteaux",
    ],
    eligibility: (h) => h.is_palace,
  },
  {
    slug: 'palaces-familles',
    titleFr: 'Les Palaces les plus adaptés aux familles',
    titleEn: 'The best Palaces for families',
    kind: 'thematic',
    targetLength: 8,
    keywordsFr: [
      'Kids Club, baby concierge, suites familiales connectées',
      'activités enfants, piscines, plage privée, animation',
      'balades, vélos, sports, ateliers culinaires',
      "Côte d'Azur, Bord de mer, montagne en été",
    ],
    eligibility: (h) => h.is_palace,
  },
  {
    slug: 'palaces-gastronomie',
    titleFr: 'Les Palaces de France avec les plus belles tables gastronomiques',
    titleEn: 'The finest Palaces in France for gastronomy',
    kind: 'awarded',
    targetLength: 10,
    keywordsFr: [
      'restaurants étoilés Michelin (1, 2 ou 3 étoiles)',
      'chefs signatures : Yannick Alléno, Anne-Sophie Pic, Alain Ducasse, Eric Frechon, Yoann Conte',
      'Le 1947 (Cheval Blanc Courchevel), Plaza Athénée, Le Bristol, Le Meurice',
      'cuisine française contemporaine, accords mets-vins, sommellerie',
    ],
    eligibility: (h) => h.is_palace,
  },
];
