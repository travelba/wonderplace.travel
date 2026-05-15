/**
 * axes.ts — canonical taxonomy for the rankings matrice.
 *
 * One source of truth for:
 *   - LLM classification of yonder Tops (`classify-yonder-axes.ts`)
 *   - The combinator that produces our seed rankings
 *     (`combinator.ts`)
 *   - The Supabase JSONB column `editorial_rankings.axes`
 *     (migration 0029)
 *   - The front-end facet UI on `/classements`
 *
 * Adding a value: extend the `as const` tuple, add an `eligibility`
 * predicate next to it (in `combinator.ts`), and run the matrice
 * regeneration. Every step downstream is type-safe via the inferred
 * Zod enum, so an unknown value will fail loudly.
 */

import { z } from 'zod';

// ─── Hotel type ──────────────────────────────────────────────────────────

export const HOTEL_TYPES = [
  'palace',
  '5-etoiles',
  '4-etoiles',
  'boutique-hotel',
  'chateau',
  'chalet',
  'villa',
  'maison-hotes',
  'resort',
  'ecolodge',
  'insolite',
  'all',
] as const;
export type HotelType = (typeof HOTEL_TYPES)[number];

export const HotelTypeSchema = z.enum(HOTEL_TYPES);

// ─── Geographic scope ────────────────────────────────────────────────────

export const LIEU_SCOPES = [
  'france',
  'region',
  'departement',
  'cluster',
  'ville',
  'arrondissement',
  'station',
  'monde',
] as const;
export type LieuScope = (typeof LIEU_SCOPES)[number];

export const LieuScopeSchema = z.enum(LIEU_SCOPES);

/**
 * Canonical lieu identifiers. The slug is what we use in the URL
 * matrice (`/classement/meilleurs-palaces-{lieu}`); the label is the
 * human-readable display string. Adding a lieu requires:
 *   1. Adding the entry below.
 *   2. Wiring its eligibility set in `combinator.ts` (which cities of
 *      the BDD belong to it).
 */
export interface LieuDef {
  readonly slug: string;
  readonly label: string;
  readonly scope: LieuScope;
  /** Cities (lowercase) of the hotel catalog mapping to this lieu. */
  readonly hotelCityKeys: readonly string[];
}

export const LIEUX: readonly LieuDef[] = [
  // National.
  {
    slug: 'france',
    label: 'France',
    scope: 'france',
    hotelCityKeys: [],
  },

  // Clusters (multi-city editorial groupings).
  {
    slug: 'paris',
    label: 'Paris',
    scope: 'ville',
    hotelCityKeys: ['paris'],
  },
  {
    slug: 'cote-d-azur',
    label: "Côte d'Azur",
    scope: 'cluster',
    hotelCityKeys: [
      'cannes',
      'nice',
      'antibes',
      "cap d'antibes",
      'cap-d-antibes',
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
    ],
  },
  {
    slug: 'french-riviera',
    label: 'French Riviera',
    scope: 'cluster',
    hotelCityKeys: [
      'cannes',
      'nice',
      'antibes',
      "cap d'antibes",
      'cap-d-antibes',
      'saint-jean-cap-ferrat',
      'cap-ferrat',
      'menton',
    ],
  },
  {
    slug: 'provence',
    label: 'Provence',
    scope: 'cluster',
    hotelCityKeys: [
      'le puy-sainte-réparade',
      'gordes',
      'lourmarin',
      'ménerbes',
      'menerbes',
      'aix-en-provence',
      'avignon',
      'arles',
      'baux-de-provence',
      'les baux-de-provence',
      'saint-rémy-de-provence',
    ],
  },
  {
    slug: 'alpilles',
    label: 'Alpilles',
    scope: 'cluster',
    hotelCityKeys: [
      'baux-de-provence',
      'les baux-de-provence',
      'saint-rémy-de-provence',
      'maussane',
      'eygalières',
    ],
  },
  {
    slug: 'luberon',
    label: 'Luberon',
    scope: 'cluster',
    hotelCityKeys: ['gordes', 'lourmarin', 'ménerbes', 'menerbes', 'bonnieux'],
  },
  {
    slug: 'alpes',
    label: 'Alpes',
    scope: 'cluster',
    hotelCityKeys: [
      'courchevel',
      'megève',
      'megeve',
      "val d'isère",
      "val d'isere",
      'chamonix',
      'chamonix-mont-blanc',
      'tignes',
      'val thorens',
      "l'alpe d'huez",
      'avoriaz',
      'morzine',
      'meribel',
    ],
  },
  {
    slug: 'corse',
    label: 'Corse',
    scope: 'region',
    hotelCityKeys: ['porto-vecchio', 'calvi', 'ajaccio', 'bonifacio', 'sartene'],
  },
  {
    slug: 'bordeaux',
    label: 'Bordeaux',
    scope: 'cluster',
    hotelCityKeys: ['bordeaux', 'martillac', 'saint-emilion', 'saint-émilion', 'pauillac'],
  },
  {
    slug: 'champagne',
    label: 'Champagne',
    scope: 'cluster',
    hotelCityKeys: ['reims', 'épernay', 'epernay', 'champillon'],
  },
  {
    slug: 'bretagne',
    label: 'Bretagne',
    scope: 'region',
    hotelCityKeys: ['rennes', 'nantes', 'saint-malo', 'dinard', 'quimper'],
  },
  {
    slug: 'normandie',
    label: 'Normandie',
    scope: 'region',
    hotelCityKeys: ['deauville', 'cabourg', 'honfleur', 'rouen', 'caen'],
  },
  {
    slug: 'pays-basque',
    label: 'Pays basque',
    scope: 'cluster',
    hotelCityKeys: ['biarritz', 'saint-jean-de-luz', 'bayonne', 'hendaye'],
  },
  {
    slug: 'loire',
    label: 'Châteaux de la Loire',
    scope: 'cluster',
    hotelCityKeys: ['tours', 'amboise', 'chinon', 'blois', 'orleans'],
  },
  {
    slug: 'alsace',
    label: 'Alsace',
    scope: 'region',
    hotelCityKeys: ['strasbourg', 'colmar', 'eguisheim', 'kaysersberg', 'ribeauvillé'],
  },

  // Cities (single-locality, often arrondissement-level).
  {
    slug: 'cannes',
    label: 'Cannes',
    scope: 'ville',
    hotelCityKeys: ['cannes'],
  },
  {
    slug: 'nice',
    label: 'Nice',
    scope: 'ville',
    hotelCityKeys: ['nice'],
  },
  {
    slug: 'saint-tropez',
    label: 'Saint-Tropez',
    scope: 'ville',
    hotelCityKeys: ['saint-tropez', 'ramatuelle', 'gassin'],
  },
  {
    slug: 'cap-ferrat',
    label: 'Cap-Ferrat',
    scope: 'ville',
    hotelCityKeys: ['saint-jean-cap-ferrat', 'cap-ferrat'],
  },
  {
    slug: 'cap-d-antibes',
    label: "Cap d'Antibes",
    scope: 'ville',
    hotelCityKeys: ["cap d'antibes", 'cap-d-antibes', 'antibes'],
  },
  {
    slug: 'biarritz',
    label: 'Biarritz',
    scope: 'ville',
    hotelCityKeys: ['biarritz'],
  },
  {
    slug: 'megeve',
    label: 'Megève',
    scope: 'station',
    hotelCityKeys: ['megève', 'megeve'],
  },
  {
    slug: 'courchevel',
    label: 'Courchevel',
    scope: 'station',
    hotelCityKeys: ['courchevel'],
  },
  {
    slug: 'val-d-isere',
    label: "Val d'Isère",
    scope: 'station',
    hotelCityKeys: ["val d'isère", "val d'isere"],
  },
  {
    slug: 'chamonix',
    label: 'Chamonix',
    scope: 'station',
    hotelCityKeys: ['chamonix', 'chamonix-mont-blanc'],
  },
  {
    slug: 'meribel',
    label: 'Méribel',
    scope: 'station',
    hotelCityKeys: ['meribel', 'méribel'],
  },
  {
    slug: 'tignes',
    label: 'Tignes',
    scope: 'station',
    hotelCityKeys: ['tignes'],
  },
  {
    slug: 'reims',
    label: 'Reims',
    scope: 'ville',
    hotelCityKeys: ['reims'],
  },
  {
    slug: 'monaco',
    label: 'Monaco',
    scope: 'ville',
    hotelCityKeys: ['monaco', 'monte-carlo'],
  },
  {
    slug: 'deauville',
    label: 'Deauville',
    scope: 'ville',
    hotelCityKeys: ['deauville'],
  },
];

export const LIEU_SLUGS = LIEUX.map((l) => l.slug) as readonly string[];

// ─── Themes (12 canonical) ───────────────────────────────────────────────

export const THEMES = [
  'romantique',
  'famille',
  'spa-bienetre',
  'gastronomie',
  'design',
  'patrimoine',
  'vignobles',
  'mer',
  'montagne',
  'campagne',
  'urbain',
  'sport-golf',
  'sport-tennis',
  'sport-padel',
  'sport-surf',
  'sport-ski',
  'rooftop',
  'piscine',
  'kids-friendly',
  'insolite',
] as const;
export type Theme = (typeof THEMES)[number];

export const ThemeSchema = z.enum(THEMES);

// ─── Occasions (broader than themes — what's the trip purpose) ────────────

export const OCCASIONS = [
  'week-end',
  'lune-de-miel',
  'anniversaire',
  'seminaire',
  'mariage',
  'escapade',
  'staycation',
  'fetes',
  'minceur',
] as const;
export type Occasion = (typeof OCCASIONS)[number];

export const OccasionSchema = z.enum(OCCASIONS);

// ─── Saison (when does this ranking apply best) ──────────────────────────

export const SAISONS = ['ete', 'hiver', 'printemps', 'automne', 'toute-annee'] as const;
export type Saison = (typeof SAISONS)[number];

export const SaisonSchema = z.enum(SAISONS);

// ─── Aggregated axes object (the JSONB column shape) ─────────────────────

export const RankingAxesSchema = z.object({
  types: z.array(HotelTypeSchema).default([]),
  lieu: z.object({
    scope: LieuScopeSchema,
    slug: z.string(),
    label: z.string(),
  }),
  themes: z.array(ThemeSchema).default([]),
  occasions: z.array(OccasionSchema).default([]),
  saison: SaisonSchema.default('toute-annee'),
});
export type RankingAxes = z.infer<typeof RankingAxesSchema>;

// ─── Helpers ─────────────────────────────────────────────────────────────

export function findLieuBySlug(slug: string): LieuDef | null {
  return LIEUX.find((l) => l.slug === slug) ?? null;
}

/**
 * Resolve a free-form lieu identifier (LLM-emitted, could be any
 * normalized lower-case string) to a known lieu in our taxonomy.
 * Returns the canonical entry OR null if unknown.
 *
 * Try in order:
 *   1. Exact slug match.
 *   2. Label normalized match.
 *   3. Heuristic: contains known city key.
 */
export function resolveLieu(raw: string): LieuDef | null {
  const norm = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
  const exact = LIEUX.find((l) => l.slug === norm);
  if (exact !== undefined) return exact;
  const byLabel = LIEUX.find(
    (l) =>
      l.label
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/gu, '')
        .replace(/[^a-z0-9]+/gu, '-') === norm,
  );
  if (byLabel !== undefined) return byLabel;
  for (const l of LIEUX) {
    for (const ck of l.hotelCityKeys) {
      if (norm === ck || norm.includes(ck) || ck.includes(norm)) return l;
    }
  }
  return null;
}
