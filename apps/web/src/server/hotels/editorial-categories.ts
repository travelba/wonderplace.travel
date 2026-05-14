import 'server-only';

import type { PublishedHotelIndexCard } from '@/server/hotels/get-hotel-by-slug';

/**
 * Editorial categories surfaced as `/categorie/[slug]` landing pages
 * (skill: seo-technical §Maillage + content-modeling).
 *
 * Each category is a pure predicate over `PublishedHotelIndexCard`,
 * so the entire categorization runs in-memory from the single
 * `listPublishedHotelsForIndex()` query — no extra Supabase round-trip
 * per category page.
 *
 * Slugs are stable URL keys (kebab-case, ASCII). Labels are localized
 * at render-time by the page-level `T` table.
 */
export interface EditorialCategory {
  readonly slug: string;
  readonly labelFr: string;
  readonly labelEn: string;
  readonly metaTitleFr: string;
  readonly metaTitleEn: string;
  readonly metaDescFr: string;
  readonly metaDescEn: string;
  readonly h1Fr: string;
  readonly h1En: string;
  readonly subtitleFr: (n: number) => string;
  readonly subtitleEn: (n: number) => string;
  readonly match: (h: PublishedHotelIndexCard) => boolean;
}

const PARIS_DEPTS = new Set(['paris', 'paris (75)', '75', 'île-de-france', 'ile-de-france']);

const MOUNTAIN_REGIONS = new Set([
  'auvergne-rhône-alpes',
  'auvergne-rhone-alpes',
  'savoie',
  'haute-savoie',
  'isère',
  'isere',
]);
const MOUNTAIN_CITIES = new Set([
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
  'lalpe-dhuez',
  'avoriaz',
  'morzine',
  'les gets',
]);

const COAST_REGIONS = new Set([
  "provence-alpes-côte d'azur",
  "provence-alpes-cote d'azur",
  'provence-alpes-cote-dazur',
  'corse',
]);
const COAST_CITIES = new Set([
  'cannes',
  'nice',
  'saint-jean-cap-ferrat',
  'cap-ferrat',
  'antibes',
  'menton',
  'monte-carlo',
  'monaco',
  'saint-tropez',
  'ramatuelle',
  'eze',
  'èze',
  'biarritz',
  'le touquet',
  'le-touquet-paris-plage',
  'la rochelle',
  'arcachon',
  'la-baule',
  'la baule',
  'deauville',
  'porto-vecchio',
  'calvi',
  'ajaccio',
]);

const VINEYARD_CITIES = new Set([
  'bordeaux',
  'martillac',
  'saint-emilion',
  'saint-émilion',
  'pauillac',
  'beaune',
  'reims',
  'épernay',
  'epernay',
]);

function lower(s: string): string {
  return s.toLowerCase().trim();
}

/**
 * Editorial categories — order matters for the `/categorie` directory
 * (lands them in this order). Each predicate is total over the index
 * card type so the matcher never throws.
 */
export const EDITORIAL_CATEGORIES: readonly EditorialCategory[] = [
  {
    slug: 'palaces-paris',
    labelFr: 'Palaces parisiens',
    labelEn: 'Parisian Palaces',
    h1Fr: 'Les Palaces parisiens',
    h1En: 'The Parisian Palaces',
    metaTitleFr: 'Palaces parisiens — Sélection ConciergeTravel',
    metaTitleEn: 'Parisian Palaces — ConciergeTravel selection',
    metaDescFr:
      'Découvrez la sélection ConciergeTravel des Palaces parisiens distingués par Atout France : Plaza Athénée, Le Bristol, Le Meurice, Ritz, Crillon, Cheval Blanc, George V…',
    metaDescEn:
      'Discover the ConciergeTravel selection of Parisian Palaces distinguished by Atout France: Plaza Athénée, Le Bristol, Le Meurice, Ritz, Crillon, Cheval Blanc, George V…',
    subtitleFr: (n) =>
      `${n} adresses parisiennes distinguées par la mention Palace d'Atout France — la conciergerie ConciergeTravel vous accompagne pour réserver l'expérience à 360°.`,
    subtitleEn: (n) =>
      `${n} Parisian addresses awarded the Palace distinction by Atout France — ConciergeTravel concierges assist you with a 360° booking experience.`,
    match: (h) => h.isPalace && PARIS_DEPTS.has(lower(h.city)),
  },
  {
    slug: 'palaces-montagne',
    labelFr: 'Palaces à la montagne',
    labelEn: 'Mountain Palaces',
    h1Fr: 'Les Palaces de montagne',
    h1En: 'Mountain Palaces',
    metaTitleFr: 'Palaces à la montagne (Alpes) — ConciergeTravel',
    metaTitleEn: 'Mountain Palaces (French Alps) — ConciergeTravel',
    metaDescFr:
      "Sélection ConciergeTravel des Palaces des Alpes : Courchevel, Megève, Val d'Isère, Chamonix — Cheval Blanc Courchevel, Les Airelles, Le Strato, Four Seasons Megève…",
    metaDescEn:
      "ConciergeTravel selection of French Alps Palaces: Courchevel, Megève, Val d'Isère, Chamonix — Cheval Blanc, Les Airelles, Le Strato, Four Seasons Megève…",
    subtitleFr: (n) =>
      `${n} Palaces des Alpes françaises — séjours ski-in / ski-out, spas après-ski et tables Michelin au cœur des massifs.`,
    subtitleEn: (n) =>
      `${n} Palaces in the French Alps — ski-in / ski-out stays, après-ski spas and Michelin tables in the heart of the massifs.`,
    match: (h) =>
      h.isPalace && (MOUNTAIN_REGIONS.has(lower(h.region)) || MOUNTAIN_CITIES.has(lower(h.city))),
  },
  {
    slug: 'palaces-bord-de-mer',
    labelFr: 'Palaces en bord de mer',
    labelEn: 'Seafront Palaces',
    h1Fr: 'Les Palaces en bord de mer',
    h1En: 'Seafront Palaces',
    metaTitleFr: "Palaces de la Côte d'Azur & bord de mer — ConciergeTravel",
    metaTitleEn: 'French Riviera & seafront Palaces — ConciergeTravel',
    metaDescFr:
      "Sélection ConciergeTravel des Palaces côte de mer : Côte d'Azur, Atlantique, Corse — Eden-Roc, Grand-Hôtel du Cap-Ferrat, La Réserve Ramatuelle, Hôtel du Palais Biarritz…",
    metaDescEn:
      'ConciergeTravel selection of seafront Palaces: French Riviera, Atlantic coast, Corsica — Eden-Roc, Grand-Hôtel du Cap-Ferrat, La Réserve Ramatuelle, Hôtel du Palais Biarritz…',
    subtitleFr: (n) =>
      `${n} Palaces les pieds dans l'eau — adresses iconiques de la Côte d'Azur, du Bassin d'Arcachon, du Pays basque et de Corse.`,
    subtitleEn: (n) =>
      `${n} seafront Palaces — iconic addresses on the French Riviera, Atlantic coast, Basque country and Corsica.`,
    match: (h) =>
      h.isPalace && (COAST_REGIONS.has(lower(h.region)) || COAST_CITIES.has(lower(h.city))),
  },
  {
    slug: 'palaces-vignobles',
    labelFr: 'Palaces & vignobles',
    labelEn: 'Vineyard Palaces',
    h1Fr: 'Les Palaces des vignobles',
    h1En: 'Vineyard Palaces',
    metaTitleFr: 'Palaces des vignobles français — ConciergeTravel',
    metaTitleEn: 'Palaces in French vineyards — ConciergeTravel',
    metaDescFr:
      'Sélection ConciergeTravel des Palaces des grandes régions viticoles : Bordeaux, Champagne, Bourgogne — Les Sources de Caudalie, Château Léoube, Domaine des Crayères…',
    metaDescEn:
      'ConciergeTravel selection of Palaces in the great wine regions: Bordeaux, Champagne, Burgundy — Les Sources de Caudalie, Château Léoube, Domaine des Crayères…',
    subtitleFr: (n) =>
      `${n} Palaces ancrés dans les terroirs viticoles français — œnotourisme, gastronomie et art de vivre.`,
    subtitleEn: (n) =>
      `${n} Palaces rooted in the great French wine terroirs — wine tourism, gastronomy and the art of living.`,
    match: (h) => h.isPalace && VINEYARD_CITIES.has(lower(h.city)),
  },
  {
    slug: 'palaces-france',
    labelFr: 'Tous les Palaces de France',
    labelEn: 'All Palaces in France',
    h1Fr: 'Les Palaces distingués par Atout France',
    h1En: 'Palaces distinguished by Atout France',
    metaTitleFr: 'Tous les Palaces de France (mention Atout France) — ConciergeTravel',
    metaTitleEn: 'All French Palaces (Atout France distinction) — ConciergeTravel',
    metaDescFr:
      "La sélection complète ConciergeTravel des Palaces français distingués par la mention officielle Atout France — Paris, Côte d'Azur, Alpes, Provence, Aquitaine.",
    metaDescEn:
      "ConciergeTravel's complete selection of French Palaces awarded the official Atout France distinction — Paris, French Riviera, Alps, Provence, Aquitaine.",
    subtitleFr: (n) =>
      `${n} adresses régulées par la mention Palace d'Atout France — la plus haute distinction hôtelière française, accordée à seulement ~30 propriétés dans tout le pays.`,
    subtitleEn: (n) =>
      `${n} addresses awarded the Palace distinction by Atout France — the highest French hotel distinction, granted to only ~30 properties nationwide.`,
    match: (h) => h.isPalace,
  },
];

export function findCategory(slug: string): EditorialCategory | null {
  for (const c of EDITORIAL_CATEGORIES) {
    if (c.slug === slug) return c;
  }
  return null;
}

export function filterCategory(
  hotels: readonly PublishedHotelIndexCard[],
  category: EditorialCategory,
): readonly PublishedHotelIndexCard[] {
  return hotels.filter((h) => category.match(h));
}
