/**
 * Maps a published `editorial_guides.slug` to the matching `hotels.city`
 * keys. Powers the "Palaces de notre sélection" cross-link block on
 * `/guide/[slug]` and feeds the `ItemList` JSON-LD graph.
 *
 * Must stay in sync with `scripts/editorial-pilot/src/guides/destinations-catalog.ts`.
 * Adding a new guide → add its slug + city keys here.
 */
export const GUIDE_HOTEL_CITY_KEYS: Readonly<Record<string, readonly string[]>> = {
  paris: ['paris'],
  'cote-d-azur': [
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
  ],
  alpes: [
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
  ],
  courchevel: ['courchevel'],
  megeve: ['megève', 'megeve'],
  cannes: ['cannes'],
  'saint-tropez': ['saint-tropez', 'ramatuelle'],
  'cap-ferrat': ['saint-jean-cap-ferrat', 'cap-ferrat'],
  'cap-d-antibes': ["cap d'antibes", 'cap-d-antibes', 'antibes'],
  biarritz: ['biarritz'],
  bordeaux: ['bordeaux', 'martillac', 'saint-emilion', 'saint-émilion', 'pauillac'],
  'reims-champagne': ['reims', 'épernay', 'epernay'],
  provence: [
    'le puy-sainte-réparade',
    'le puy sainte réparade',
    'gordes',
    'lourmarin',
    'ménerbes',
    'menerbes',
  ],
  corse: ['porto-vecchio', 'calvi', 'ajaccio', 'bonifacio'],
};

export function getCityKeysForGuide(slug: string): readonly string[] {
  return GUIDE_HOTEL_CITY_KEYS[slug] ?? [];
}
