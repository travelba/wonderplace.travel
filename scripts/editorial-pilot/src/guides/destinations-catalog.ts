/**
 * Editorial destinations catalog — single source of truth for the
 * `/guide/[slug]` route surface. Each entry drives one `editorial_guides`
 * row in Supabase + one generated long-form article.
 *
 * Coverage: French luxury-travel hotspots that actually host one or
 * more Palaces in our catalog (so each guide can naturally cross-link
 * to fiches via `<RelatedHotels>` and emit an `ItemList[Hotel]` JSON-LD
 * graph). Adding a destination here MUST be paired with at least one
 * published `hotels` row mapping to the same city / cluster.
 *
 * The `keywords` field feeds the IA prompts so the editorial copy
 * captures domain-specific facts (architects, palaces, gastronomic
 * heritage) — never a generic Wikipedia summary.
 */

export type GuideScope = 'city' | 'cluster' | 'region' | 'country';

export interface DestinationGuideSeed {
  /** URL slug — kebab-case ASCII, stable. */
  readonly slug: string;
  /** Display name FR. */
  readonly nameFr: string;
  /** Display name EN. */
  readonly nameEn: string;
  /** Editorial scope (drives the JSON-LD shape). */
  readonly scope: GuideScope;
  /** ISO 3166-1 alpha-2 country code. */
  readonly countryCode: string;
  /** Matching `hotels.city` values (case-insensitive) for cross-link. */
  readonly hotelCityKeys: readonly string[];
  /** Editorial keywords / facts the AI MUST anchor (palaces, history, gastronomy). */
  readonly keywordsFr: readonly string[];
  /** Editorial keywords / facts the AI MUST anchor (EN locale). */
  readonly keywordsEn: readonly string[];
  /** One-line "tone" hint for the AI ("intemporel", "alpin", "balnéaire"). */
  readonly toneFr: string;
  /** Optional Cloudinary hero `public_id` already curated by editorial. */
  readonly heroImage?: string;
}

export const DESTINATIONS: readonly DestinationGuideSeed[] = [
  // ── Paris ─────────────────────────────────────────────────────────────────
  {
    slug: 'paris',
    nameFr: 'Paris',
    nameEn: 'Paris',
    scope: 'city',
    countryCode: 'FR',
    hotelCityKeys: ['paris'],
    keywordsFr: [
      'Palaces parisiens Atout France',
      'Plaza Athénée, Le Bristol, Le Meurice, Ritz, Crillon, Cheval Blanc, George V, Lutetia, Mandarin Oriental',
      "Triangle d'or — Avenue Montaigne, rue Saint-Honoré, Champs-Élysées",
      'Rive gauche : Saint-Germain-des-Prés, Lutetia, Le Pavillon de la Reine',
      'Gastronomie : Alléno, Ducasse, Anne-Sophie Pic, Cyril Lignac',
      'Musées : Louvre, Orsay, Orangerie, Picasso, Rodin',
      "Saisons : Fashion Weeks, Roland-Garros, Salon de l'Aéronautique",
      'Aéroports : CDG (32 km), Orly (18 km), Le Bourget (jet privé)',
    ],
    keywordsEn: [
      'Parisian Palaces awarded by Atout France',
      'Plaza Athénée, Le Bristol, Le Meurice, Ritz, Crillon, Cheval Blanc Paris',
      'Golden Triangle: Avenue Montaigne, Rue Saint-Honoré, Champs-Élysées',
      'Left Bank: Saint-Germain-des-Prés, Lutetia',
      'Gastronomy: Alléno, Ducasse, Pic, Lignac',
      'Museums: Louvre, Orsay, Orangerie, Picasso, Rodin',
    ],
    toneFr: 'intemporel, élégant, parisien',
    heroImage: 'editorial/destinations/paris-hero',
  },

  // ── Côte d'Azur (cluster) ─────────────────────────────────────────────────
  {
    slug: 'cote-d-azur',
    nameFr: "Côte d'Azur",
    nameEn: 'French Riviera',
    scope: 'cluster',
    countryCode: 'FR',
    hotelCityKeys: [
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
    keywordsFr: [
      'Riviera française — de Saint-Tropez à Menton',
      'Palaces emblématiques : Hôtel du Cap-Eden-Roc, Grand-Hôtel du Cap-Ferrat, La Réserve Ramatuelle, Cheval Blanc Saint-Tropez, Le Negresco, Château Saint-Martin, Cap-Estel',
      'Climat méditerranéen — 300 jours de soleil',
      'Festival de Cannes (mai), Grand Prix de Monaco (mai), Yachting',
      "Gastronomie : Mauro Colagreco (Mirazur), Argilla, La Vague d'Or",
      "Aéroport : Nice-Côte d'Azur (NCE), héliport de Monaco",
    ],
    keywordsEn: [
      'French Riviera — from Saint-Tropez to Menton',
      'Iconic Palaces: Hôtel du Cap-Eden-Roc, Grand-Hôtel du Cap-Ferrat, La Réserve, Cheval Blanc Saint-Tropez',
      'Mediterranean climate — 300 sunny days',
      'Cannes Film Festival, Monaco Grand Prix, yachting',
      'Gastronomy: Mauro Colagreco (Mirazur)',
    ],
    toneFr: 'balnéaire, lumineux, méditerranéen',
    heroImage: 'editorial/destinations/cote-d-azur-hero',
  },

  // ── Alpes (cluster) ───────────────────────────────────────────────────────
  {
    slug: 'alpes',
    nameFr: 'Alpes françaises',
    nameEn: 'French Alps',
    scope: 'cluster',
    countryCode: 'FR',
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
    ],
    keywordsFr: [
      "Stations 5 étoiles — Courchevel 1850, Megève, Val d'Isère, Chamonix",
      'Palaces alpins : Les Airelles, Cheval Blanc Courchevel, Le K2 Palace, Six Senses Courchevel, Four Seasons Megève, Le Strato',
      'Domaine skiable des 3 Vallées (600 km de pistes)',
      'Ski-in / ski-out, hélicoptère privé, dameuse de nuit',
      'Gastronomie alpine : Le 1947 (Yannick Alléno, Cheval Blanc), Pierre Gagnaire',
      'Saisons : ski (décembre-avril), été montagne (juin-septembre)',
    ],
    keywordsEn: [
      "Five-star resorts: Courchevel 1850, Megève, Val d'Isère, Chamonix",
      'Alpine Palaces: Les Airelles, Cheval Blanc Courchevel, Le K2 Palace, Six Senses',
      '3 Valleys ski domain (600 km of slopes)',
      'Alpine gastronomy: Le 1947 (Yannick Alléno)',
    ],
    toneFr: 'alpin, sportif, exclusif',
    heroImage: 'editorial/destinations/alpes-hero',
  },

  // ── Courchevel (city) ─────────────────────────────────────────────────────
  {
    slug: 'courchevel',
    nameFr: 'Courchevel',
    nameEn: 'Courchevel',
    scope: 'city',
    countryCode: 'FR',
    hotelCityKeys: ['courchevel'],
    keywordsFr: [
      'Courchevel 1850 — station la plus prestigieuse des Alpes',
      "Palaces : Les Airelles, Cheval Blanc Courchevel, Le K2 Palace, Six Senses Courchevel, L'Apogée, Le Strato, Aman Le Mélézin",
      'Domaine skiable des 3 Vallées — 600 km, ski-in / ski-out',
      'Altiport (privatif), héliport, Genève à 2h en voiture',
      "Gastronomie : Le 1947 (Yannick Alléno), La Table de l'Hubert",
      'Saison : 15 décembre - 15 avril (hiver), été restreint',
    ],
    keywordsEn: [
      'Courchevel 1850 — most prestigious resort in the Alps',
      'Palaces: Les Airelles, Cheval Blanc Courchevel, Le K2 Palace',
      'Altiport, helipad, 2h from Geneva',
    ],
    toneFr: 'altitudes, raffiné, exclusivité absolue',
  },

  // ── Megève ────────────────────────────────────────────────────────────────
  {
    slug: 'megeve',
    nameFr: 'Megève',
    nameEn: 'Megève',
    scope: 'city',
    countryCode: 'FR',
    hotelCityKeys: ['megève', 'megeve'],
    keywordsFr: [
      'Megève — village 5* aux portes du Mont-Blanc',
      'Palaces : Four Seasons Megève, Le Fer à Cheval, Les Fermes de Marie',
      'Patrimoine Noémie de Rothschild — esprit village authentique',
      'Domaine Évasion Mont-Blanc — 445 km de pistes',
      'Aéroport de Genève (1h30)',
      "Gastronomie : La Table de l'Alpaga, 1920 (Edouard Loubet)",
    ],
    keywordsEn: [
      'Megève — 5-star village at the gates of Mont-Blanc',
      'Palaces: Four Seasons Megève, Le Fer à Cheval, Les Fermes de Marie',
      'Évasion Mont-Blanc ski domain (445 km)',
    ],
    toneFr: 'authentique, village, chaleureux',
  },

  // ── Cannes ────────────────────────────────────────────────────────────────
  {
    slug: 'cannes',
    nameFr: 'Cannes',
    nameEn: 'Cannes',
    scope: 'city',
    countryCode: 'FR',
    hotelCityKeys: ['cannes'],
    keywordsFr: [
      'Cannes — capitale du cinéma et des yachts',
      'Palaces : Carlton Cannes, Majestic Barrière, Martinez, JW Marriott',
      'Boulevard de la Croisette, Palais des Festivals',
      'Îles de Lérins (Sainte-Marguerite, Saint-Honorat)',
      'Festival de Cannes (mai), MIPIM, Cannes Lions',
      "Aéroport Nice-Côte d'Azur (30 min), héliport (15 min)",
    ],
    keywordsEn: [
      'Cannes — capital of cinema and yachts',
      'Palaces: Carlton, Majestic, Martinez, JW Marriott',
      'Croisette, Palais des Festivals, Lérins Islands',
    ],
    toneFr: 'cinématographique, méditerranéen, glamour',
  },

  // ── Saint-Tropez ──────────────────────────────────────────────────────────
  {
    slug: 'saint-tropez',
    nameFr: 'Saint-Tropez',
    nameEn: 'Saint-Tropez',
    scope: 'city',
    countryCode: 'FR',
    hotelCityKeys: ['saint-tropez', 'ramatuelle'],
    keywordsFr: [
      'Saint-Tropez — village mythique du golfe',
      'Palaces : Cheval Blanc Saint-Tropez (ex-Résidence de la Pinède), La Réserve Ramatuelle, Lou Pinet, Byblos',
      'Plages de Pampelonne — Club 55, Nikki Beach, La Plage des Jumeaux',
      'Citadelle, place des Lices, port',
      'Yachting, Voiles de Saint-Tropez (octobre)',
      'Aéroport Saint-Tropez La Môle (jet privé) ou Nice (1h30)',
    ],
    keywordsEn: [
      'Saint-Tropez — legendary village of the gulf',
      'Palaces: Cheval Blanc Saint-Tropez, La Réserve Ramatuelle, Byblos',
      'Pampelonne beaches: Club 55, Nikki Beach',
    ],
    toneFr: 'estival, festif, méditerranéen',
  },

  // ── Saint-Jean-Cap-Ferrat ─────────────────────────────────────────────────
  {
    slug: 'cap-ferrat',
    nameFr: 'Cap-Ferrat',
    nameEn: 'Cap-Ferrat',
    scope: 'city',
    countryCode: 'FR',
    hotelCityKeys: ['saint-jean-cap-ferrat', 'cap-ferrat'],
    keywordsFr: [
      "Saint-Jean-Cap-Ferrat — presqu'île la plus chère du monde",
      "Palaces : Grand-Hôtel du Cap-Ferrat (Four Seasons), Cap-Estel, La Voile d'Or",
      'Villa Ephrussi de Rothschild, Villa Santo Sospir',
      'Sentier des douaniers, plage de Passable',
      'Aéroport Nice (20 min), héliport Monaco (8 min)',
    ],
    keywordsEn: [
      'Saint-Jean-Cap-Ferrat — most expensive peninsula in the world',
      'Palaces: Grand-Hôtel du Cap-Ferrat (Four Seasons), Cap-Estel',
      'Villa Ephrussi de Rothschild',
    ],
    toneFr: 'serein, exclusif, intime',
  },

  // ── Cap d'Antibes ────────────────────────────────────────────────────────
  {
    slug: 'cap-d-antibes',
    nameFr: "Cap d'Antibes",
    nameEn: "Cap d'Antibes",
    scope: 'city',
    countryCode: 'FR',
    hotelCityKeys: ["cap d'antibes", 'cap-d-antibes', 'antibes'],
    keywordsFr: [
      "Cap d'Antibes — entre Cannes et Nice",
      'Palaces : Hôtel du Cap-Eden-Roc (1870)',
      'Plage de la Garoupe, Phare de la Garoupe',
      'Musée Picasso, Vieil Antibes, Port Vauban',
      "Aéroport Nice-Côte d'Azur (20 min)",
    ],
    keywordsEn: [
      "Cap d'Antibes — between Cannes and Nice",
      'Palace: Hôtel du Cap-Eden-Roc (1870)',
      'Musée Picasso, Old Antibes',
    ],
    toneFr: 'discret, prestigieux, intemporel',
  },

  // ── Biarritz ──────────────────────────────────────────────────────────────
  {
    slug: 'biarritz',
    nameFr: 'Biarritz',
    nameEn: 'Biarritz',
    scope: 'city',
    countryCode: 'FR',
    hotelCityKeys: ['biarritz'],
    keywordsFr: [
      'Biarritz — perle de la Côte basque',
      "Palace : Hôtel du Palais (1854, ancien palais d'été d'Eugénie de Montijo)",
      'Plages : Grande Plage, Plage Miramar, Côte des Basques',
      'Surf, golf, thalasso',
      'Pays basque, Bayonne, San Sebastián (45 min)',
      'Aéroport BIQ',
    ],
    keywordsEn: [
      'Biarritz — pearl of the Basque coast',
      'Palace: Hôtel du Palais (1854)',
      'Grande Plage, surf, thalasso',
    ],
    toneFr: 'atlantique, basque, raffiné',
  },

  // ── Bordeaux ──────────────────────────────────────────────────────────────
  {
    slug: 'bordeaux',
    nameFr: 'Bordeaux',
    nameEn: 'Bordeaux',
    scope: 'city',
    countryCode: 'FR',
    hotelCityKeys: ['bordeaux', 'martillac', 'saint-emilion', 'saint-émilion', 'pauillac'],
    keywordsFr: [
      'Bordeaux — capitale mondiale du vin (UNESCO)',
      'Palaces : Les Sources de Caudalie (Martillac), Château Hôtel Grand Barrail (Saint-Émilion), InterContinental Bordeaux',
      'Vignobles : Médoc, Saint-Émilion, Pessac-Léognan, Pomerol',
      "Cité du Vin, Place de la Bourse, Miroir d'Eau",
      'Châteaux : Margaux, Lafite Rothschild, Cheval Blanc',
      'Œnotourisme, vendanges (septembre-octobre)',
      'Aéroport BOD, TGV Paris (2h)',
    ],
    keywordsEn: [
      'Bordeaux — world wine capital (UNESCO)',
      'Palace: Les Sources de Caudalie (Martillac)',
      'Vineyards: Médoc, Saint-Émilion, Pessac-Léognan',
    ],
    toneFr: 'viticole, gastronomique, art de vivre',
  },

  // ── Reims / Champagne ─────────────────────────────────────────────────────
  {
    slug: 'reims-champagne',
    nameFr: 'Reims & Champagne',
    nameEn: 'Reims & Champagne',
    scope: 'cluster',
    countryCode: 'FR',
    hotelCityKeys: ['reims', 'épernay', 'epernay'],
    keywordsFr: [
      'Reims — cité des sacres, capitale du Champagne',
      'Palaces : Domaine Les Crayères (Reims), Royal Champagne (Champillon)',
      'Maisons : Pommery, Veuve Clicquot, Krug, Ruinart, Moët & Chandon, Dom Pérignon',
      'Cathédrale Notre-Dame de Reims (UNESCO), Palais du Tau',
      'Caves visitables, vendanges (septembre)',
      'TGV Paris (45 min)',
    ],
    keywordsEn: [
      'Reims — city of coronations, capital of Champagne',
      'Palaces: Domaine Les Crayères, Royal Champagne',
      'Maisons: Pommery, Veuve Clicquot, Krug, Moët & Chandon',
    ],
    toneFr: 'effervescent, royal, gastronomique',
  },

  // ── Provence ──────────────────────────────────────────────────────────────
  {
    slug: 'provence',
    nameFr: 'Provence',
    nameEn: 'Provence',
    scope: 'cluster',
    countryCode: 'FR',
    hotelCityKeys: [
      'le puy-sainte-réparade',
      'le puy sainte réparade',
      'gordes',
      'lourmarin',
      'ménerbes',
      'menerbes',
    ],
    keywordsFr: [
      'Provence — Luberon, Alpilles, plateau de Valensole',
      'Palaces : Villa La Coste (Le Puy-Sainte-Réparade), La Coquillade Provence Resort, Capelongue (Beaumes)',
      'Villages perchés : Gordes, Roussillon, Bonnieux, Lourmarin',
      'Lavande (juillet-août), oliviers, marchés provençaux',
      "Festival d'Aix-en-Provence, vendanges",
      'Aéroport Marseille (1h), TGV Avignon',
    ],
    keywordsEn: [
      'Provence — Luberon, Alpilles, Valensole plateau',
      'Palaces: Villa La Coste, La Coquillade Provence Resort',
      'Hilltop villages: Gordes, Roussillon, Lourmarin',
    ],
    toneFr: 'rural, lumineux, art de vivre',
  },

  // ── Corse ─────────────────────────────────────────────────────────────────
  {
    slug: 'corse',
    nameFr: 'Corse',
    nameEn: 'Corsica',
    scope: 'region',
    countryCode: 'FR',
    hotelCityKeys: ['porto-vecchio', 'calvi', 'ajaccio', 'bonifacio'],
    keywordsFr: [
      'Corse — île de beauté, GR20, plages Lavezzi',
      'Adresses : Domaine de Murtoli, Cala Rossa (Porto-Vecchio), Casadelmar',
      'Bonifacio (falaises calcaires), Calvi (citadelle génoise), Ajaccio (Napoléon)',
      'Cuisine : charcuterie corse, brocciu, vins AOP, miel',
      'Aéroport Figari / Calvi / Ajaccio, ferry Marseille-Toulon-Nice',
    ],
    keywordsEn: [
      'Corsica — island of beauty, GR20 trail, Lavezzi beaches',
      'Domaine de Murtoli, Cala Rossa, Casadelmar',
      'Bonifacio cliffs, Calvi citadel, Ajaccio',
    ],
    toneFr: 'sauvage, méditerranéen, intemporel',
  },
];

export function findDestinationBySlug(slug: string): DestinationGuideSeed | null {
  return DESTINATIONS.find((d) => d.slug === slug) ?? null;
}
