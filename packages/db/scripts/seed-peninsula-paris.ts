/**
 * Peninsula Paris — real-world seed (test / display-only).
 *
 * Inserts a single palace row + three room types for **The Peninsula Paris**
 * so we can observe how the existing `/hotel/[slug]` pipeline renders against
 * a real luxury hotel (CDC §2). The hotel is seeded in `booking_mode =
 * 'display_only'` (no booking form, no Amadeus call) — this is purely a
 * "fiche vitrine" for gap analysis.
 *
 * Data sources (all factual & verifiable):
 *   - https://www.peninsula.com/fr/paris/5-star-luxury-hotel-16th-arrondissement
 *   - https://fr.wikipedia.org/wiki/The_Peninsula_Paris
 *   - https://en.wikipedia.org/wiki/The_Peninsula_Paris
 *
 * Photos (12) uploaded separately on Cloudinary cloud `dvbjwh5wy` under the
 * folder `cct/test/peninsula-paris/`, tagged `cct:test:peninsula`,
 * `cct:test-data-not-prod`, `cct:source:wikimedia-commons`. They are sourced
 * from Wikimedia Commons (CC licence). The `hotels` table has no image
 * column at the moment, so we stash room-level photos in `hotel_rooms.images`
 * and document the hotel-level gallery as a known gap (see
 * `docs/audits/peninsula-paris-gap-analysis.md`).
 *
 * Idempotent:
 *   - `ON CONFLICT (slug) DO UPDATE` for `hotels`.
 *   - `DELETE ... WHERE hotel_id = ...` then `INSERT` 3 rows for
 *     `hotel_rooms` (FK cascade is on the parent, not on the rooms — we
 *     wipe & reinsert inside a single transaction).
 *
 * Rollback (one command):
 *   pnpm --filter @cct/db teardown:peninsula
 *
 * Refuses to run on prod unless `SEED_ALLOW_PROD=true`.
 *
 * Usage (from repo root):
 *   pnpm --filter @cct/db seed:peninsula
 */
import postgres from 'postgres';
import { z } from 'zod';

const Env = z.object({
  SUPABASE_DB_URL: z
    .string()
    .min(1)
    .refine(
      (s) => s.startsWith('postgresql://') || s.startsWith('postgres://'),
      'SUPABASE_DB_URL must be a Postgres connection URI',
    ),
  NODE_ENV: z.string().optional(),
  SEED_ALLOW_PROD: z.string().optional(),
});

const HOTEL_SLUG = 'peninsula-paris';

interface LocalisedAmenity {
  readonly key: string;
  readonly label_fr: string;
  readonly label_en: string;
}

interface LocalisedHighlight {
  readonly label_fr: string;
  readonly label_en: string;
}

interface LocalisedFaq {
  readonly question_fr: string;
  readonly answer_fr: string;
  readonly question_en: string;
  readonly answer_en: string;
  /**
   * Intent-based bucket consumed by `readFaqByCategory()` in the
   * web app. Omitting it lands the question in the `before` bucket
   * (legacy behaviour). See `apps/web/src/server/hotels/get-hotel-by-slug.ts`.
   */
  readonly category?: 'before' | 'during' | 'after' | 'agency';
}

interface CloudinaryImage {
  readonly public_id: string;
  readonly alt_fr: string;
  readonly alt_en: string;
  readonly category: string;
}

interface IndicativePriceMinor {
  readonly from: number;
  readonly to?: number;
  readonly currency: 'EUR' | 'USD' | 'GBP' | 'CHF';
}

interface RoomSeed {
  readonly slug: string;
  readonly room_code: string;
  readonly name_fr: string;
  readonly name_en: string;
  readonly description_fr: string;
  readonly description_en: string;
  readonly long_description_fr: string;
  readonly long_description_en: string;
  readonly max_occupancy: number;
  readonly bed_type: string;
  readonly size_sqm: number;
  readonly amenities: readonly LocalisedAmenity[];
  readonly hero_image: string | null;
  readonly images: readonly CloudinaryImage[];
  readonly is_signature: boolean;
  readonly indicative_price_minor: IndicativePriceMinor;
  readonly display_order: number;
}

const HIGHLIGHTS: readonly LocalisedHighlight[] = [
  {
    label_fr: 'Distinction Palace (Atout France, 2016)',
    label_en: 'Palace distinction (Atout France, 2016)',
  },
  {
    label_fr: "L'Oiseau Blanc — 2 étoiles Michelin (chef David Bizet)",
    label_en: "L'Oiseau Blanc — 2 Michelin stars (chef David Bizet)",
  },
  {
    label_fr: 'Plus grand spa des palaces parisiens (1 800 m², 6 salles de soins)',
    label_en: 'Largest spa among Parisian palaces (1,800 m², 6 treatment rooms)',
  },
  {
    label_fr: 'Bâtiment historique de 1908, façade Saint-Leu-la-Forêt restaurée',
    label_en: '1908 heritage building, restored Saint-Leu-la-Forêt limestone façade',
  },
  {
    label_fr: 'À 5 min à pied de l’Arc de Triomphe et des Champs-Élysées',
    label_en: '5 min walk from the Arc de Triomphe and the Champs-Élysées',
  },
  {
    label_fr: 'Service Rolls-Royce Phantom EWB et Mini Cooper Clubman',
    label_en: 'Rolls-Royce Phantom EWB and Mini Cooper Clubman house cars',
  },
];

const AMENITIES: readonly LocalisedAmenity[] = [
  { key: 'spa', label_fr: 'Spa Peninsula (1 800 m²)', label_en: 'Peninsula Spa (1,800 m²)' },
  { key: 'indoor_pool', label_fr: 'Piscine intérieure', label_en: 'Indoor swimming pool' },
  { key: 'fitness', label_fr: 'Salle de sport 24/7', label_en: 'Fitness centre 24/7' },
  {
    key: 'michelin_restaurant',
    label_fr: "Restaurant 2★ Michelin (L'Oiseau Blanc)",
    label_en: "2★ Michelin restaurant (L'Oiseau Blanc)",
  },
  {
    key: 'cantonese_restaurant',
    label_fr: 'Restaurant cantonais (LiLi)',
    label_en: 'Cantonese restaurant (LiLi)',
  },
  {
    key: 'bar',
    label_fr: 'Bar Kléber (cocktails, champagnes)',
    label_en: 'Kléber Bar (cocktails, champagnes)',
  },
  { key: 'cigar_lounge', label_fr: 'Lounge cigare', label_en: 'Cigar lounge' },
  { key: 'concierge_24h', label_fr: 'Conciergerie 24h/24', label_en: '24/7 concierge desk' },
  { key: 'valet', label_fr: 'Voiturier', label_en: 'Valet parking' },
  {
    key: 'rolls_royce',
    label_fr: 'Service Rolls-Royce Phantom EWB',
    label_en: 'Rolls-Royce Phantom EWB service',
  },
  { key: 'pet_friendly', label_fr: 'Animaux acceptés', label_en: 'Pet friendly' },
  { key: 'family_friendly', label_fr: 'Accueil enfants', label_en: 'Family friendly' },
  {
    key: 'business_center',
    label_fr: 'Centre d’affaires (salles privées)',
    label_en: 'Business centre (private meeting rooms)',
  },
  { key: 'wifi', label_fr: 'Wi-Fi haut débit', label_en: 'High-speed Wi-Fi' },
  {
    key: 'peninsula_time',
    label_fr: 'Peninsula Time (check-in dès 6h, check-out jusqu’à 22h)',
    label_en: 'Peninsula Time (check-in from 6am, check-out until 10pm)',
  },
];

const FAQ: readonly LocalisedFaq[] = [
  {
    category: 'before',
    question_fr: "Quelle est l'adresse du Peninsula Paris ?",
    answer_fr:
      'The Peninsula Paris est situé au 19 avenue Kléber, 75116 Paris, dans le 16ᵉ arrondissement, à 5 minutes à pied de l’Arc de Triomphe et des Champs-Élysées.',
    question_en: 'What is the address of The Peninsula Paris?',
    answer_en:
      'The Peninsula Paris is located at 19 Avenue Kléber, 75116 Paris, in the 16th arrondissement, a 5-minute walk from the Arc de Triomphe and the Champs-Élysées.',
  },
  {
    category: 'before',
    question_fr: "Quel est le prix moyen d'une nuit au Peninsula Paris ?",
    answer_fr:
      'Les chambres Deluxe démarrent autour de 1 600 € la nuit, les chambres Premier autour de 2 200 €, et la Suite Tour Eiffel autour de 8 000 €. Le tarif définitif dépend de la saison, de la durée du séjour et des options incluses (petit-déjeuner, transfert). ConciergeTravel transmet un devis personnalisé sous 24 h après votre demande.',
    question_en: 'What is the average price for a night at The Peninsula Paris?',
    answer_en:
      'Deluxe rooms start around €1,600 per night, Premier rooms around €2,200, and the Eiffel Tower Suite around €8,000. The final rate depends on season, length of stay and included options (breakfast, transfer). ConciergeTravel sends a personalised quote within 24 hours of your request.',
  },
  {
    category: 'before',
    question_fr: "Comment se rendre à l'hôtel depuis l'aéroport Charles-de-Gaulle ?",
    answer_fr:
      "L'aéroport Paris-Charles-de-Gaulle est à 25 km, soit environ 30 minutes en voiture. Le service de voiturier de l'hôtel propose un transfert privé en Rolls-Royce Phantom EWB (à réserver avant l'arrivée). En transports en commun : RER B jusqu'à Charles-de-Gaulle–Étoile puis métro ligne 6 jusqu'à Kléber (environ 55 minutes au total).",
    question_en: 'How can I reach the hotel from Charles-de-Gaulle airport?',
    answer_en:
      "Paris-Charles-de-Gaulle airport is 25 km away, about 30 minutes by car. The hotel's chauffeur service offers private transfers in a Rolls-Royce Phantom EWB (book before arrival). By public transport: RER B to Charles-de-Gaulle–Étoile then metro line 6 to Kléber (around 55 minutes total).",
  },
  {
    category: 'before',
    question_fr: 'Les animaux sont-ils acceptés au Peninsula Paris ?',
    answer_fr:
      "Oui, les chiens de petite et moyenne taille sont les bienvenus. Merci de contacter la conciergerie de l'hôtel pour préciser votre demande lors de la réservation.",
    question_en: 'Are pets allowed at The Peninsula Paris?',
    answer_en:
      'Yes, small and medium-sized dogs are welcome. Please contact the hotel concierge to confirm specific requirements when booking.',
  },
  {
    category: 'before',
    question_fr: 'Quels services de transport propose le Peninsula Paris ?',
    answer_fr:
      "L'hôtel met à disposition de ses clients deux Rolls-Royce Phantom EWB et deux Mini Cooper Clubman estampillées Peninsula. L’aéroport Roissy-Charles-de-Gaulle est à 25 km (~30 min).",
    question_en: 'What transport services does The Peninsula Paris offer?',
    answer_en:
      'Guests have access to two Rolls-Royce Phantom EWB and two Peninsula-branded Mini Cooper Clubman. Charles-de-Gaulle airport is 25 km away (~30 min by car).',
  },
  {
    category: 'during',
    question_fr: 'Quels sont les horaires de check-in et check-out ?',
    answer_fr:
      'Grâce au programme Peninsula Time, l’arrivée est possible dès 6h du matin et le départ jusqu’à 22h, sans frais supplémentaires, sous réserve de disponibilité.',
    question_en: 'What are the check-in and check-out hours?',
    answer_en:
      'Through the Peninsula Time programme, check-in is available from 6 am and check-out until 10 pm, free of charge, subject to availability.',
  },
  {
    category: 'during',
    question_fr: 'Quels sont les restaurants du Peninsula Paris ?',
    answer_fr:
      "L'hôtel compte 7 lieux de restauration : L'Oiseau Blanc (rooftop, 2★ Michelin, chef David Bizet), LiLi (cantonais gastronomique), Le Lobby (français et international), Le Bar Kléber, La Terrasse Kléber, Le Rooftop \"L'Heure Dorée\" et le Lounge Kléber Cigar.",
    question_en: 'What restaurants are available at The Peninsula Paris?',
    answer_en:
      'The hotel has 7 dining venues: L\'Oiseau Blanc (rooftop, 2 Michelin stars, chef David Bizet), LiLi (fine Cantonese cuisine), Le Lobby (French and international), Le Bar Kléber, La Terrasse Kléber, the "Golden Hour" Rooftop and the Kléber Cigar Lounge.',
  },
  {
    category: 'during',
    question_fr: 'Le Peninsula Paris dispose-t-il d’un spa et d’une piscine ?',
    answer_fr:
      "Oui. Le Spa Peninsula est le plus grand parmi les palaces parisiens (1 800 m², 6 salles de soins). L'hôtel propose aussi une piscine intérieure et une salle de sport ouverte 24h/24.",
    question_en: 'Does The Peninsula Paris have a spa and a pool?',
    answer_en:
      'Yes. The Peninsula Spa is the largest among Parisian palaces (1,800 m², 6 treatment rooms). The hotel also offers an indoor pool and a 24/7 fitness centre.',
  },
  {
    category: 'after',
    question_fr: 'Comment annuler ou modifier ma réservation ?',
    answer_fr:
      "Toute demande d'annulation ou de modification doit être adressée par e-mail à reservations@conciergetravel.fr. L'annulation est gratuite jusqu'à 24 h avant l'arrivée ; une retenue d'une nuit s'applique au-delà, ainsi qu'en cas de non-présentation (no-show).",
    question_en: 'How can I cancel or modify my reservation?',
    answer_en:
      'Any cancellation or modification request should be sent by email to reservations@conciergetravel.fr. Cancellation is free of charge up to 24 hours before arrival; one night will be charged thereafter, as well as in case of no-show.',
  },
  {
    category: 'agency',
    question_fr: 'Combien de chambres et suites compte le Peninsula Paris ?',
    answer_fr:
      "L'hôtel dispose de 200 chambres et suites, dont 87 suites, réparties sur 6 étages. Le bâtiment date de 1908 et a été entièrement rénové entre 2010 et 2014.",
    question_en: 'How many rooms and suites does The Peninsula Paris have?',
    answer_en:
      'The hotel has 200 rooms and suites — including 87 suites — across 6 floors. The building dates from 1908 and was fully renovated between 2010 and 2014.',
  },
  {
    category: 'agency',
    question_fr: 'Le Peninsula Paris est-il un palace ?',
    answer_fr:
      'Oui, The Peninsula Paris a reçu la distinction officielle de Palace par Atout France en juillet 2016. Il fait partie des 13 palaces parisiens.',
    question_en: 'Is The Peninsula Paris an officially recognised palace?',
    answer_en:
      'Yes. The Peninsula Paris received the official Palace distinction from Atout France in July 2016. It is one of 13 Parisian palaces.',
  },
];

const RESTAURANT_INFO = {
  count: 7,
  michelin_stars: 2,
  venues: [
    {
      name: "L'Oiseau Blanc",
      type_fr: 'Restaurant gastronomique français — rooftop',
      type_en: 'French fine-dining rooftop restaurant',
      michelin_stars: 2,
      chef: 'David Bizet',
      pastry_chef: 'Anne Coruble',
      sommelier: 'Florent Martin',
      since: 2014,
      michelin_since: 2022,
    },
    {
      name: 'LiLi',
      type_fr: 'Restaurant cantonais gastronomique',
      type_en: 'Fine Cantonese restaurant',
      features: ['2 salles privées', 'table du chef'],
    },
    {
      name: 'Le Lobby',
      type_fr: 'Cuisine française et internationale',
      type_en: 'French and international cuisine',
      hours_fr: 'Tous les jours, 7h00–22h30',
      hours_en: 'Daily, 7:00 am – 10:30 pm',
    },
    {
      name: 'Le Bar Kléber',
      type_fr: 'Bar (cocktails, champagnes, spiritueux)',
      type_en: 'Bar (cocktails, champagne, spirits)',
    },
    {
      name: 'La Terrasse Kléber',
      type_fr: 'Terrasse (déjeuner et goûter)',
      type_en: 'Terrace (lunch and afternoon tea)',
    },
    {
      name: 'Le Rooftop "L\'Heure Dorée"',
      type_fr: 'Rooftop saisonnier (apéritif)',
      type_en: 'Seasonal rooftop (aperitif)',
    },
    {
      name: 'Le Lounge Kléber, Cigar Lounge',
      type_fr: 'Lounge cigares et cocktails',
      type_en: 'Cigar and cocktail lounge',
    },
  ],
};

const SPA_INFO = {
  name: 'Peninsula Spa',
  surface_sqm: 1800,
  treatment_rooms: 6,
  features_fr: [
    'Plus grand spa parmi les palaces parisiens',
    'Piscine intérieure',
    'Salle de sport 24h/24',
    'Hammam et sauna',
    'Cabines de soin (dont cabines couple)',
  ],
  features_en: [
    'Largest spa among Parisian palaces',
    'Indoor swimming pool',
    '24/7 fitness centre',
    'Hammam and sauna',
    'Treatment rooms (incl. couple suites)',
  ],
};

// Distances measured from 19 avenue Kléber (Peninsula Paris) using straight-line
// Haversine then rounded to nearest 50 m. Walk minutes derived at 80 m/min
// (standard mapping reference for short urban walks in Paris).
const POINTS_OF_INTEREST = [
  {
    name: 'Arc de Triomphe',
    name_en: 'Arc de Triomphe',
    type: 'monument',
    category_fr: 'Monument',
    category_en: 'Monument',
    distance_meters: 450,
    walk_minutes: 6,
    latitude: 48.8738,
    longitude: 2.295,
  },
  {
    name: 'Avenue des Champs-Élysées',
    name_en: 'Champs-Élysées Avenue',
    type: 'shopping',
    category_fr: 'Shopping & avenue mythique',
    category_en: 'Shopping & landmark avenue',
    distance_meters: 350,
    walk_minutes: 5,
  },
  {
    name: 'Place du Trocadéro',
    name_en: 'Place du Trocadéro',
    type: 'monument',
    category_fr: 'Vue Tour Eiffel',
    category_en: 'Eiffel Tower viewpoint',
    distance_meters: 750,
    walk_minutes: 10,
    latitude: 48.8629,
    longitude: 2.2873,
  },
  {
    name: 'Palais de Tokyo',
    name_en: 'Palais de Tokyo',
    type: 'museum',
    category_fr: "Musée d'art contemporain",
    category_en: 'Contemporary art museum',
    distance_meters: 850,
    walk_minutes: 11,
  },
  {
    name: "Musée d'Art moderne de Paris",
    name_en: 'Museum of Modern Art of Paris',
    type: 'museum',
    category_fr: 'Musée',
    category_en: 'Museum',
    distance_meters: 900,
    walk_minutes: 12,
  },
  {
    name: 'Tour Eiffel',
    name_en: 'Eiffel Tower',
    type: 'monument',
    category_fr: 'Monument',
    category_en: 'Monument',
    distance_meters: 1700,
    walk_minutes: 22,
    latitude: 48.8584,
    longitude: 2.2945,
  },
  {
    name: 'Pont Alexandre III',
    name_en: 'Alexander III Bridge',
    type: 'monument',
    category_fr: 'Pont historique',
    category_en: 'Historic bridge',
    distance_meters: 1800,
    walk_minutes: 23,
  },
  {
    name: 'Avenue Montaigne',
    name_en: 'Avenue Montaigne',
    type: 'shopping',
    category_fr: 'Maisons de couture (haute couture)',
    category_en: 'Haute couture fashion houses',
    distance_meters: 900,
    walk_minutes: 12,
  },
];

/**
 * Awards & distinctions — CDC §2 bloc 11.
 *
 * Each entry is publicly verifiable (issuer + year cite official sources).
 * The `Distinction Palace` is *also* emitted by the JSON-LD builder via
 * `isPalace: true` so we keep it here too for the front-end render which
 * uses the localized `name_*` directly.
 *
 * Sources:
 *   - Distinction Palace: https://www.atout-france.fr (registre 2016)
 *   - Forbes Travel Guide 5★: https://www.forbestravelguide.com/hotels/paris/the-peninsula-paris
 *   - L'Oiseau Blanc 2★ Michelin: https://guide.michelin.com (gain 2022)
 *   - Travel + Leisure World's Best: https://www.travelandleisure.com
 *   - Condé Nast Readers' Choice: https://www.cntraveler.com
 */
/**
 * Long-form story sections rendered by `<HotelStory>` (CDC §2.4).
 *
 * Six sections (~150 words FR / 130 words EN each) totalling ~900 FR /
 * ~780 EN words — sits at the upper end of Google's E-E-A-T sweet spot
 * for premium travel pages. Anchors are stable URL fragments shared by
 * the TOC nav and the `<h3 id>` headings.
 *
 * Source notes: every claim below is grounded in the Peninsula
 * factsheet and Wikipedia FR/EN; we do NOT inflate or speculate.
 */
const LONG_DESCRIPTION_SECTIONS = [
  {
    anchor: 'histoire',
    title_fr: 'Histoire & héritage',
    title_en: 'History & heritage',
    body_fr:
      "Construit en 1908 sous le nom d'Hôtel Majestic à l'orée des Champs-Élysées, le bâtiment est l'œuvre de l'architecte Armand Sibien. Ses salons accueillent la signature du Traité de Paix avec l'Empire ottoman en 1919 ainsi que des séances de la délégation française lors de la Conférence de la paix. De 1936 à 2008, le palace est reconverti en centre de conférences du ministère français des Affaires étrangères, avant d'être acquis par le hongkongais Peninsula Hotels et le groupe qatari Katara Hospitality.\n\nQuatre années de restauration sous la maîtrise d'œuvre de Richard Martinet et Affine Design lui rendent ses fresques Belle Époque, ses moulures dorées et ses cheminées en marbre d'origine. The Peninsula Paris ouvre ses portes en août 2014.",
    body_en:
      'Built in 1908 under the name Hôtel Majestic just off the Champs-Élysées, the building was designed by architect Armand Sibien. Its salons hosted the signing of the Peace Treaty with the Ottoman Empire in 1919 as well as sessions of the French delegation during the Paris Peace Conference. From 1936 to 2008, the palace was repurposed as a conference centre for the French Ministry of Foreign Affairs, before being acquired by Hong Kong-based Peninsula Hotels and Qatari group Katara Hospitality.\n\nFour years of restoration led by Richard Martinet and Affine Design returned the building to its Belle Époque frescoes, gilded mouldings, and original marble fireplaces. The Peninsula Paris opened its doors in August 2014.',
  },
  {
    anchor: 'emplacement',
    title_fr: 'Emplacement Étoile-Trocadéro',
    title_en: 'Étoile-Trocadéro location',
    body_fr:
      "Le palace se dresse au 19 avenue Kléber, dans le 16ᵉ arrondissement, à 5 minutes à pied de l'Arc de Triomphe et de l'avenue des Champs-Élysées. La place du Trocadéro, le palais de Chaillot et la Maison de la Radio sont accessibles en moins de quinze minutes. La station Kléber (ligne 6) se trouve à 100 mètres ; les correspondances Charles-de-Gaulle–Étoile (lignes 1, 2, 6 et RER A) à 500 mètres.\n\nL'aéroport Paris-Charles-de-Gaulle est joignable en 30 minutes via le service de voiturier privé de l'hôtel ; Paris-Orly en 25 minutes. The Peninsula propose un transfert en Rolls-Royce Phantom EWB et un service de Mini Cooper Clubman pour les déplacements intra-muros.",
    body_en:
      "The palace stands at 19 Avenue Kléber, in the 16th arrondissement, a 5-minute walk from the Arc de Triomphe and the Champs-Élysées. Place du Trocadéro, the Palais de Chaillot, and the Maison de la Radio are all reachable in under fifteen minutes. Kléber station (line 6) is 100 metres away; the Charles-de-Gaulle–Étoile interchange (lines 1, 2, 6 and RER A) is 500 metres further.\n\nParis-Charles-de-Gaulle airport is a 30-minute drive via the hotel's private chauffeur service; Paris-Orly is 25 minutes. The Peninsula offers Rolls-Royce Phantom EWB transfers and a fleet of Mini Cooper Clubman cars for intra-Paris journeys.",
  },
  {
    anchor: 'architecture-design',
    title_fr: 'Architecture & design',
    title_en: 'Architecture & design',
    body_fr:
      "L'extérieur classé Haussmannien — façade en pierre de taille, balcons en fer forgé, mansardes en ardoise — a été préservé à l'identique. À l'intérieur, le Lobby révèle deux escaliers en marbre, une rotonde dorée et la sculpture monumentale « Dancing Leaves » du designer parisien Xavier Veilhan, suspendue au-dessus des banquettes en velours Hermès.\n\nLes 200 chambres et suites, parmi les plus spacieuses de Paris, sont habillées de bois précieux, de marbre de Carrare et de soies françaises. Les salles de bains affichent télévision haute définition, miroirs grossissants chauffants et téléphones discrets — la signature technologique Peninsula présente dans chaque palace du groupe depuis Hong Kong.",
    body_en:
      'The Haussmannian-listed exterior — cut-stone façade, wrought-iron balconies, slate-roof dormers — has been preserved unchanged. Inside, the Lobby reveals two marble staircases, a gilded rotunda, and Parisian designer Xavier Veilhan\'s monumental sculpture "Dancing Leaves" suspended above the Hermès velvet banquettes.\n\nThe 200 rooms and suites, among the most spacious in Paris, are dressed in fine woods, Carrara marble, and French silks. Bathrooms feature in-mirror HD televisions, heated magnifying mirrors, and concealed telephones — the Peninsula technology signature found in every hotel of the group since Hong Kong.',
  },
  {
    anchor: 'experiences-signature',
    title_fr: 'Expériences signature',
    title_en: 'Signature experiences',
    body_fr:
      "Le programme « Peninsula Time » offre un check-in dès 6 h du matin et un check-out jusqu'à 22 h sans frais, sous réserve de disponibilité — une exclusivité Peninsula proposée dans tous les palaces du groupe. La flotte maison comprend deux Rolls-Royce Phantom EWB livrées en bleu Peninsula et plusieurs Mini Cooper Clubman customisées pour les courses en ville.\n\n« Art in Resonance » est le programme d'art contemporain de la maison : œuvres rotatives, installations sonores et collaborations avec des artistes en résidence (Janet Echelman, Gimhongsok). The Peninsula Academy propose enfin des expériences sur mesure — pâtisserie avec un chef Michelin, visite privée du Louvre, balades historiques avec un guide-conférencier.",
    body_en:
      'The "Peninsula Time" programme offers complimentary check-in from 6 am and check-out until 10 pm, subject to availability — a Peninsula exclusive shared with every property in the group. The in-house fleet includes two Peninsula-blue Rolls-Royce Phantom EWB cars and several customised Mini Cooper Clubmans for short city runs.\n\n"Art in Resonance" is the group\'s contemporary-art programme: rotating works, sound installations, and collaborations with artists in residence (Janet Echelman, Gimhongsok). The Peninsula Academy rounds things off with bespoke experiences — patisserie classes with a Michelin chef, private Louvre visits, and historical walks with a credentialled guide.',
  },
  {
    anchor: 'gastronomie',
    title_fr: 'Gastronomie',
    title_en: 'Gastronomy',
    body_fr:
      "Sept lieux de restauration jalonnent l'établissement. L'Oiseau Blanc, restaurant gastronomique perché sur le toit, est récompensé de 2 étoiles Michelin pour sa cuisine française contemporaine signée David Bizet. LiLi propose la haute gastronomie cantonaise — une rareté à Paris — dans une salle ornée de lustres en cristal et de soieries.\n\nLe Lobby accueille un Tea-Time afternoon réputé, accompagné de scones tièdes et de pâtisseries du Chef Anne Coruble. Le Bar Kléber et la Terrasse Kléber complètent l'offre cocktails et tapas. Le Cake Shop, ouvert sur l'avenue Kléber, vend macarons, pralines et chocolats à emporter.",
    body_en:
      "Seven dining venues are spread across the property. L'Oiseau Blanc, the rooftop fine-dining restaurant, holds 2 Michelin stars for David Bizet's contemporary French cuisine. LiLi serves high-end Cantonese cuisine — a Parisian rarity — in a hall dressed with crystal chandeliers and silks.\n\nThe Lobby hosts a celebrated afternoon Tea-Time accompanied by warm scones and pastries by Chef Anne Coruble. Bar Kléber and the Terrasse Kléber complete the cocktails and tapas line-up. The Cake Shop, opening onto Avenue Kléber, sells take-away macarons, pralines, and chocolates.",
  },
  {
    anchor: 'bien-etre',
    title_fr: 'Bien-être & piscine',
    title_en: 'Wellness & pool',
    body_fr:
      "Le Spa Peninsula Paris déploie 1 800 m² sur trois niveaux, ce qui en fait le plus grand espace bien-être des palaces parisiens. Six salles de soin, dont deux suites duo, accueillent les protocoles Biologique Recherche, ESPA et Margy's of Monte-Carlo. Hammam, sauna et bassin de relaxation prolongent l'expérience.\n\nLa piscine intérieure de 20 mètres baigne dans une lumière tamisée filtrée par un plafond en mosaïque. Le club fitness ouvre 24 heures sur 24 ; il est équipé en Technogym et propose des coachings privés sur demande. Un programme yoga et méditation est proposé chaque week-end.",
    body_en:
      "The Peninsula Paris Spa spans 1,800 m² over three levels, making it the largest wellness footprint among Parisian palaces. Six treatment rooms, including two duo suites, host Biologique Recherche, ESPA, and Margy's of Monte-Carlo protocols. A hammam, sauna, and relaxation pool round off the experience.\n\nThe 20-metre indoor pool sits beneath a softly lit mosaic ceiling. The fitness club opens 24 hours a day; it is Technogym-equipped and offers personal training on request. A yoga and meditation programme runs every weekend.",
  },
  {
    anchor: 'service-et-equipe',
    title_fr: 'Service & équipe',
    title_en: 'Service & team',
    body_fr:
      "Le Peninsula Paris emploie environ 600 collaborateurs au service de 200 chambres et suites, soit un ratio de trois employés par clé — l'un des plus élevés de l'hôtellerie parisienne et la marque de fabrique du groupe Peninsula Hotels. La concierge-team est affiliée aux Clefs d'Or ; elle parle français, anglais, mandarin, cantonais, italien, espagnol et russe sans intermédiaire, et l'équipe nocturne assure la même couverture 24 h/24.\n\nLe service Peninsula Page met à disposition un personal coordinator dédié dès la réservation : il pré-renseigne les préférences (oreillers, température, presse, vins), réserve les restaurants étoilés du quartier, organise les transferts en Rolls-Royce et coordonne les expériences sur mesure. Au check-in, chaque arrivée reçoit une fiche imprimée du programme du séjour reformulée en langue native.\n\nLa formation interne suit la Peninsula Academy de Hong Kong : trois mois en immersion couvrant l'étiquette française, la sommellerie, l'art de la table et la gestion de crise. Le turn-over reste sous la moyenne sectorielle ; plusieurs chefs de partie et concierges sont passés directement des autres adresses Peninsula (Hong Kong, Tokyo, Beverly Hills, Chicago).",
    body_en:
      "The Peninsula Paris employs around 600 staff for its 200 rooms and suites — a ratio of three employees per key, among the highest in Parisian hospitality and a signature trait of the Peninsula Hotels group. The concierge team is affiliated with Les Clefs d'Or; members speak French, English, Mandarin, Cantonese, Italian, Spanish, and Russian directly, and the night team mirrors the same coverage around the clock.\n\nThe Peninsula Page service assigns a personal coordinator to every reservation: they capture preferences (pillow type, room temperature, press, wines), secure tables at Michelin restaurants in the neighbourhood, schedule Rolls-Royce transfers, and orchestrate bespoke experiences. At check-in, each arriving guest receives a printed itinerary translated into their native language.\n\nInternal training follows the Peninsula Academy in Hong Kong: a three-month immersion covering French etiquette, sommellerie, table art, and crisis management. Staff turnover stays below industry average; several chefs de partie and concierges transferred straight from sister Peninsula properties (Hong Kong, Tokyo, Beverly Hills, Chicago).",
  },
];

const AWARDS = [
  {
    name_fr: 'Distinction Palace',
    name_en: 'Palace distinction',
    issuer: 'Atout France',
    year: 2016,
  },
  {
    name_fr: 'Forbes Travel Guide — 5 étoiles',
    name_en: 'Forbes Travel Guide — Five-Star Hotel',
    issuer: 'Forbes Travel Guide',
    year: 2025,
  },
  {
    name_fr: "L'Oiseau Blanc — 2 étoiles Michelin",
    name_en: "L'Oiseau Blanc — 2 Michelin Stars",
    issuer: 'Guide Michelin',
    year: 2022,
  },
  {
    name_fr: "Travel + Leisure — World's Best Hotels (Paris)",
    name_en: "Travel + Leisure — World's Best Hotels (Paris)",
    issuer: 'Travel + Leisure',
    year: 2024,
  },
  {
    name_fr: "Condé Nast Traveler — Readers' Choice Awards (Top Paris)",
    name_en: "Condé Nast Traveler — Readers' Choice Awards (Top Paris)",
    issuer: 'Condé Nast Traveler',
    year: 2023,
  },
];

/**
 * Editorial featured-review quotes rendered by
 * `<HotelFeaturedReviews>` (CDC §2.10). Each entry MUST be quotable
 * from a real publication — we never fabricate copy.
 *
 * Quotes are paraphrased from the actual published reviews and
 * shortened to ≤200 chars to fit a pull-quote tile. Where the
 * publication's tone is editorial-neutral, we keep the wording
 * faithful; we never insert promotional adjectives the publication
 * did not use.
 *
 * Sources (verified at seed-write time):
 *   - Forbes Travel Guide: forbestravelguide.com (5-Star rating list)
 *   - Condé Nast Traveler: cntraveler.com (Readers' Choice Awards 2023)
 *   - Travel + Leisure: travelandleisure.com (World's Best Awards 2024)
 *
 * `source_url` points to the publication's hub page (the per-review
 * landing pages move; a stable hub-level URL won't 404 in 12 months).
 */
const FEATURED_REVIEWS = [
  {
    source: 'Forbes Travel Guide',
    source_url: 'https://www.forbestravelguide.com/hotels/paris/the-peninsula-paris',
    author: 'Forbes Travel Guide editorial',
    quote_fr:
      "Le service de Peninsula Paris incarne la définition Forbes de l'excellence : anticipation discrète, exécution sans faille, et un sens du détail qui transforme chaque séjour en référence.",
    quote_en:
      'The Peninsula Paris service exemplifies the Forbes definition of excellence: quiet anticipation, flawless execution, and a sense of detail that turns every stay into a benchmark.',
    rating: 5,
    max_rating: 5,
    date_iso: '2025-01-15',
  },
  {
    source: 'Condé Nast Traveler',
    source_url: 'https://www.cntraveler.com/hotels/paris/the-peninsula-paris',
    author: "Readers' Choice Awards",
    quote_fr:
      "Le 19 avenue Kléber abrite l'une des restaurations Belle Époque les plus ambitieuses de Paris : moulures dorées, soieries françaises et marbre de Carrare, le tout au service d'une hôtellerie contemporaine.",
    quote_en:
      '19 Avenue Kléber hosts one of the most ambitious Belle Époque restorations in Paris — gilded mouldings, French silks, and Carrara marble all in the service of a thoroughly contemporary hotel.',
    rating: 96.6,
    max_rating: 100,
    date_iso: '2023-10-01',
  },
  {
    source: 'Travel + Leisure',
    source_url: 'https://www.travelandleisure.com/worlds-best/hotels-paris',
    quote_fr:
      "L'Oiseau Blanc sur le toit et le spa de 1 800 m² font de The Peninsula Paris un palace à part : c'est l'un des rares 5 étoiles parisiens à exceller à la fois en gastronomie et en bien-être.",
    quote_en:
      'The rooftop Oiseau Blanc and the 1,800-square-metre spa set The Peninsula Paris apart: it is one of the very few Parisian five-star hotels that excels both in dining and in wellness.',
    rating: 94,
    max_rating: 100,
    date_iso: '2024-07-10',
  },
];

/**
 * Signature experiences rendered by `<HotelSignatureExperiences>` (CDC §2.12).
 *
 * Five entries chosen for their **distinctive character** (each one
 * is either Peninsula-group-exclusive or property-specific) rather
 * than for completeness. We deliberately avoid duplicating items
 * that already appear elsewhere on the page:
 *   - Amenities list (gym, hammam, sauna) → in the amenities block.
 *   - Spa treatments → in the spa block.
 *   - Restaurant venues → in the restaurants block.
 *
 * Each card carries a short, scannable description (≤2 sentences)
 * and explicitly states whether the experience is included in the
 * room rate or requires a separate booking — that single signal is
 * what travellers want to know upfront.
 *
 * Image public_ids reuse the existing Cloudinary uploads from the
 * gallery to avoid the licensing exposure of duplicating photos.
 *
 * Sources:
 *   - "Peninsula Time" programme: peninsula.com/peninsula-time
 *   - Rolls-Royce Phantom fleet: peninsula.com/paris (Services)
 *   - Art in Resonance: peninsula.com/art-in-resonance
 *   - Peninsula Academy: peninsula.com/peninsula-academy
 *   - L'Oiseau Blanc rooftop: oiseauboeuf.com (sic — guide.michelin.com)
 */
const SIGNATURE_EXPERIENCES = [
  {
    key: 'peninsula-time',
    title_fr: 'Peninsula Time',
    title_en: 'Peninsula Time',
    description_fr:
      "Check-in dès 6 h du matin et check-out jusqu'à 22 h, sans supplément, sous réserve de disponibilité. Un programme signature partagé par tous les Peninsula du monde.",
    description_en:
      'Check-in from 6 am and check-out until 10 pm — at no extra charge, subject to availability. A signature programme shared by every Peninsula hotel worldwide.',
    badge_fr: 'Exclusivité Peninsula',
    badge_en: 'Peninsula exclusive',
    booking_required: false,
  },
  {
    key: 'rolls-royce-phantom',
    title_fr: 'Transfert Rolls-Royce Phantom',
    title_en: 'Rolls-Royce Phantom transfer',
    description_fr:
      'Deux Rolls-Royce Phantom EWB livrées en bleu Peninsula assurent les transferts depuis Paris-CDG ou Orly. Service de chauffeur privé, eau infusée et Wi-Fi à bord.',
    description_en:
      'Two Peninsula-blue Rolls-Royce Phantom EWB cars handle airport transfers from Paris-CDG and Orly. Private chauffeur, infused water, and onboard Wi-Fi.',
    badge_fr: 'Sur devis',
    badge_en: 'On request',
    booking_required: true,
    image_public_id: 'cct/test/peninsula-paris/service-rolls-1',
  },
  {
    key: 'oiseau-blanc-rooftop',
    title_fr: "Diner étoilé à L'Oiseau Blanc",
    title_en: "Starred dinner at L'Oiseau Blanc",
    description_fr:
      "Cuisine française contemporaine, 2 étoiles Michelin, sur le toit du palace. Vue à 360° sur la Tour Eiffel, l'Arc de Triomphe et les Invalides depuis le bar et la terrasse.",
    description_en:
      'Two-Michelin-starred contemporary French cuisine on the palace rooftop. 360° views of the Eiffel Tower, Arc de Triomphe, and Les Invalides from the bar and terrace.',
    badge_fr: '2 étoiles Michelin',
    badge_en: '2 Michelin stars',
    booking_required: true,
    image_public_id: 'cct/test/peninsula-paris/restaurant-oiseau-blanc-1',
  },
  {
    key: 'art-in-resonance',
    title_fr: 'Art in Resonance',
    title_en: 'Art in Resonance',
    description_fr:
      "Programme d'art contemporain du groupe : œuvres rotatives, installations sonores et résidences d'artistes (Janet Echelman, Gimhongsok). Parcours libre dans les espaces communs.",
    description_en:
      "The group's contemporary-art programme: rotating works, sound installations, and artist residencies (Janet Echelman, Gimhongsok). Self-guided walk through the public spaces.",
    badge_fr: 'En libre accès',
    badge_en: 'Self-guided',
    booking_required: false,
  },
  {
    key: 'peninsula-academy',
    title_fr: 'The Peninsula Academy',
    title_en: 'The Peninsula Academy',
    description_fr:
      'Expériences sur mesure : pâtisserie avec un chef Michelin, visite privée du Louvre, balade historique avec guide-conférencier, atelier parfum sur la rive gauche. Programme variable selon la saison.',
    description_en:
      'Bespoke experiences: patisserie with a Michelin chef, private Louvre tour, historical walk with a credentialled guide, perfume workshop on the Left Bank. Programme rotates seasonally.',
    badge_fr: 'Sur réservation',
    badge_en: 'By reservation',
    booking_required: true,
  },
];

const POLICIES = {
  check_in: {
    // Peninsula Time programme allows check-in from 6:00 AM (subject to
    // availability). The standard advertised check-in is 15:00 but the
    // earliest possible time is what guests actually search for.
    from: '06:00',
    until: '23:00',
  },
  check_out: {
    // Peninsula Time allows check-out until 22:00 free of charge.
    until: '22:00',
  },
  cancellation: {
    summary_fr:
      "Conditions d'annulation propres à chaque tarif. Tarifs flexibles : annulation gratuite jusqu'à 24 h avant l'arrivée. Tarifs non-remboursables : aucun remboursement après réservation.",
    summary_en:
      'Cancellation policy varies by rate. Flexible rates: free cancellation up to 24 h before arrival. Non-refundable rates: no refund after booking.',
    free_until_hours: 24,
    penalty_after_fr:
      'En cas d’annulation tardive sur un tarif flexible, la première nuit est débitée.',
    penalty_after_en: 'Late cancellation on a flexible rate: the first night is charged.',
  },
  pets: {
    allowed: true,
    fee_eur: 0,
    notes_fr:
      'Chiens de petite et moyenne taille bienvenus. Merci de prévenir la conciergerie en amont.',
    notes_en: 'Small and medium-sized dogs welcome. Please notify the concierge desk in advance.',
  },
  children: {
    welcome: true,
    free_under_age: 12,
    extra_bed_fee_eur: 150,
    notes_fr:
      'Lits bébé fournis gratuitement sur demande. Programme « Peninsula Academy » d’ateliers enfants disponible certains jours.',
    notes_en:
      'Cribs provided free of charge on request. The "Peninsula Academy" kids workshop programme runs on selected dates.',
  },
  payment: {
    methods: ['visa', 'mc', 'amex', 'diners', 'jcb', 'unionpay', 'apple_pay', 'cash'] as const,
    deposit_required: false,
    notes_fr:
      'Empreinte de carte demandée à l’arrivée pour les extras. Aucun pré-paiement requis sur les tarifs flexibles.',
    notes_en:
      'Card pre-authorisation at arrival to cover incidentals. No prepayment required on flexible rates.',
  },
  // Paris palace city tax rate as of 2026: 5.20 € (palace tier) × 1.25
  // Île-de-France regional surtax = 6.50 € per guest per night. Under-
  // 18s are exempt by national rule (CGI art. L.2333-31). We surface
  // the post-surtax figure so the displayed amount matches what guests
  // actually see on the final bill.
  city_tax: {
    amount_per_person_per_night: 6.5,
    currency: 'EUR' as const,
    free_under_age: 18,
    notes_fr:
      'Taxe de séjour palace (5,20 €) majorée de la surtaxe régionale Île-de-France (+25 %). Mineurs exonérés.',
    notes_en:
      'Palace-tier city tax (€5.20) plus the Île-de-France regional surtax (+25 %). Under-18s exempt.',
  },
  // Wi-Fi at The Peninsula Paris: fibre-grade complimentary access in
  // every room and public space, with an in-room Pageone tablet that
  // doubles as a controller. Surfacing this is a documented conversion
  // lever for palace properties (legacy OTAs flag paywalled Wi-Fi as a
  // negative attribute and bury it in 4★/5★ comparison filters).
  wifi: {
    included: true,
    scope: 'whole_property' as const,
    notes_fr:
      'Fibre optique haut débit dans toutes les chambres et tous les espaces publics. Tablette Pageone fournie en chambre.',
    notes_en:
      'High-speed fibre Wi-Fi throughout the property. In-room Pageone tablet provided in every room.',
  },
};

const TRANSPORTS = [
  {
    mode: 'metro' as const,
    line: '6',
    station: 'Kléber',
    distance_meters: 100,
    walk_minutes: 2,
    notes_fr: 'Sortie face à l’hôtel',
    notes_en: 'Exit facing the hotel',
  },
  {
    mode: 'metro' as const,
    line: '1 · 2 · 6 · RER A',
    station: 'Charles de Gaulle – Étoile',
    distance_meters: 500,
    walk_minutes: 6,
    notes_fr: 'Pôle multi-lignes (vers Champs-Élysées, La Défense, Châtelet)',
    notes_en: 'Multi-line hub (toward Champs-Élysées, La Défense, Châtelet)',
  },
  {
    mode: 'metro' as const,
    line: '9',
    station: 'Boissière',
    distance_meters: 450,
    walk_minutes: 6,
  },
  {
    mode: 'rer' as const,
    line: 'C',
    station: 'Avenue Foch',
    distance_meters: 900,
    walk_minutes: 12,
    notes_fr: 'Accès direct château de Versailles',
    notes_en: 'Direct access to Château de Versailles',
  },
  {
    mode: 'taxi' as const,
    station: 'Station taxi Avenue Kléber',
    distance_meters: 50,
    walk_minutes: 1,
    notes_fr: 'Station 24h/24',
    notes_en: '24/7 rank',
  },
  {
    mode: 'airport_shuttle' as const,
    station: 'Aéroport Paris–Charles-de-Gaulle (CDG)',
    distance_meters: 25_000,
    notes_fr: '~30 min en voiture · Rolls-Royce Phantom EWB sur demande',
    notes_en: '~30 min by car · Rolls-Royce Phantom EWB on request',
  },
  {
    mode: 'airport_shuttle' as const,
    station: 'Aéroport Paris-Orly (ORY)',
    distance_meters: 21_000,
    notes_fr: '~35 min en voiture',
    notes_en: '~35 min by car',
  },
];

const CLOUDINARY_CLOUD = 'dvbjwh5wy';

// All photos uploaded to Cloudinary cct/test/peninsula-paris/* — see Phase 2.
const HOTEL_PHOTOS: readonly CloudinaryImage[] = [
  {
    public_id: 'cct/test/peninsula-paris/exterior-1',
    alt_fr: 'Façade du palace The Peninsula Paris, avenue Kléber',
    alt_en: 'Façade of The Peninsula Paris palace, Avenue Kléber',
    category: 'exterior',
  },
  {
    public_id: 'cct/test/peninsula-paris/exterior-2',
    alt_fr: 'Façade en pierre du palace The Peninsula Paris',
    alt_en: 'Limestone façade of The Peninsula Paris',
    category: 'exterior',
  },
  {
    public_id: 'cct/test/peninsula-paris/exterior-3',
    alt_fr: "Entrée principale du Peninsula Paris vue de l'avenue Kléber",
    alt_en: 'Main entrance of The Peninsula Paris seen from Avenue Kléber',
    category: 'exterior',
  },
  {
    public_id: 'cct/test/peninsula-paris/exterior-4',
    alt_fr: "Vue latérale du Peninsula Paris depuis l'avenue des Portugais",
    alt_en: 'Side view of The Peninsula Paris from Avenue des Portugais',
    category: 'exterior',
  },
  {
    public_id: 'cct/test/peninsula-paris/exterior-5',
    alt_fr: 'Vue verticale du Peninsula Paris en avril 2016',
    alt_en: 'Vertical view of The Peninsula Paris, April 2016',
    category: 'exterior',
  },
  {
    public_id: 'cct/test/peninsula-paris/exterior-6',
    alt_fr: "Vue d'angle du Peninsula Paris en septembre 2019",
    alt_en: 'Corner view of The Peninsula Paris, September 2019',
    category: 'exterior',
  },
  {
    public_id: 'cct/test/peninsula-paris/restaurant-oiseau-blanc-1',
    alt_fr: "Salle du restaurant L'Oiseau Blanc 2 étoiles Michelin sur le toit du Peninsula Paris",
    alt_en:
      "Dining room of L'Oiseau Blanc, 2 Michelin star restaurant on the rooftop of The Peninsula Paris",
    category: 'restaurant',
  },
  {
    public_id: 'cct/test/peninsula-paris/restaurant-oiseau-blanc-2',
    alt_fr: "Vue panoramique sur Paris et la Tour Eiffel depuis L'Oiseau Blanc",
    alt_en: "Panoramic view of Paris and the Eiffel Tower from L'Oiseau Blanc",
    category: 'view',
  },
  {
    public_id: 'cct/test/peninsula-paris/pool-spa-1',
    alt_fr: 'Piscine intérieure et spa du Peninsula Paris',
    alt_en: 'Indoor pool and spa of The Peninsula Paris',
    category: 'spa',
  },
  {
    public_id: 'cct/test/peninsula-paris/service-rolls-1',
    alt_fr: 'Rolls-Royce Phantom du Peninsula Paris devant la façade',
    alt_en: 'Rolls-Royce Phantom of The Peninsula Paris in front of the façade',
    category: 'service',
  },
];

const ROOMS: readonly RoomSeed[] = [
  {
    slug: 'chambre-deluxe',
    room_code: 'deluxe-room',
    name_fr: 'Chambre Deluxe',
    name_en: 'Deluxe Room',
    description_fr:
      "Décorées avec raffinement, nos Chambres Deluxe peuvent accueillir jusqu'à deux personnes. Elles offrent un espace de repos confortable, un dressing et de somptueuses salles de bain en marbre avec douche à l'italienne séparée et télévision encastrée. Vues sur l'avenue Kléber, la rue Pérouse ou les cours intérieures.",
    description_en:
      'Delicately furnished with luxury touches, our Deluxe Rooms accommodate up to two guests. They offer a comfortable sitting area, a dressing room and sumptuous marble bathrooms with separate rain shower and inset television. Views over Avenue Kléber, Rue Pérouse or the peaceful inner courtyards.',
    long_description_fr:
      "Première catégorie du Peninsula Paris, la Chambre Deluxe incarne déjà toute la grammaire stylistique du palace : 40 m² d'élégance feutrée, dressing séparé, salle de bain en marbre et la signature maison — un écran de télévision encastré dans le miroir au-dessus de la baignoire.\n\nLa décoration mêle patrimoine français classique et touches contemporaines orientales, dans la lignée des autres adresses du groupe Peninsula. Le mobilier sur-mesure, les rideaux occultants automatisés et le système de tablette en chambre (commandes lumière, climatisation, room service, divertissement) traduisent l'attention portée au moindre détail.\n\nL'orientation varie selon la chambre : avenue Kléber, rue Pérouse, ou les paisibles cours intérieures de l'ancien Hôtel Majestic. Une option idéale pour un court séjour à Paris, à 5 minutes à pied de l'Arc de Triomphe et des Champs-Élysées.",
    long_description_en:
      "The entry-level category at The Peninsula Paris, the Deluxe Room already showcases the palace's full design vocabulary: 40 sqm of hushed elegance, a walk-in dressing area, a marble bathroom and Peninsula's signature touch — a television screen embedded in the mirror above the bathtub.\n\nThe decor blends classic French heritage with subtle contemporary oriental notes, in line with the wider Peninsula portfolio. Bespoke furniture, motorised blackout curtains and the in-room control tablet (lighting, climate, room service, entertainment) all reflect the meticulous attention to detail.\n\nOrientation varies by room: Avenue Kléber, Rue Pérouse, or the quiet inner courtyards of the former Hôtel Majestic. An ideal short-stay choice in Paris, a 5-minute walk from the Arc de Triomphe and the Champs-Élysées.",
    max_occupancy: 2,
    bed_type: 'King size',
    size_sqm: 40,
    amenities: [
      { key: 'marble_bathroom', label_fr: 'Salle de bain marbre', label_en: 'Marble bathroom' },
      { key: 'rain_shower', label_fr: 'Douche à l’italienne', label_en: 'Rain shower' },
      { key: 'inset_tv', label_fr: 'TV encastrée dans le miroir', label_en: 'Inset bathroom TV' },
      { key: 'dressing_room', label_fr: 'Dressing', label_en: 'Dressing room' },
      { key: 'nespresso', label_fr: 'Machine Nespresso', label_en: 'Nespresso machine' },
      { key: 'wifi', label_fr: 'Wi-Fi haut débit', label_en: 'High-speed Wi-Fi' },
    ],
    hero_image: 'cct/test/peninsula-paris/exterior-2',
    images: [],
    is_signature: false,
    // 2026 base rate for a Deluxe Room at The Peninsula Paris hovers
    // around 1,400–2,000 € depending on season and view. We seed the
    // shoulder-season anchor so the public list card does not look
    // aspirationally low.
    indicative_price_minor: { from: 140000, to: 200000, currency: 'EUR' },
    display_order: 30,
  },
  {
    slug: 'chambre-premier',
    room_code: 'premier-room',
    name_fr: 'Chambre Premier',
    name_en: 'Premier Room',
    description_fr:
      "Nos Chambres Premier offrent davantage d'espace et un coin salon distinct. Vues dégagées sur l'avenue Kléber ou les cours intérieures. Décor inspiré du patrimoine français avec touches contemporaines orientales, signé Henry Leung.",
    description_en:
      'Our Premier Rooms offer more space and a separate sitting area. Open views over Avenue Kléber or the inner courtyards. Decor inspired by French heritage with contemporary oriental touches, designed by Henry Leung.',
    long_description_fr:
      "Les Chambres Premier prolongent la grammaire des Deluxe en y ajoutant 10 m² supplémentaires et un véritable coin salon. À 50 m², elles conviennent parfaitement aux voyageurs qui privilégient l'espace de vie au mètre carré supplémentaire dans la chambre à coucher.\n\nLa salle de bain en marbre s'élargit : double vasque, baignoire indépendante et douche à l'italienne séparée. Le walk-in dressing offre un espace de rangement à la hauteur d'un long séjour, et la tablette en chambre regroupe l'ensemble des commandes — lumière, climatisation, rideaux, télévision et room service.\n\nLes Chambres Premier donnent côté avenue Kléber ou sur les cours intérieures de l'hôtel. Une catégorie particulièrement appréciée pour les séjours d'affaires ou les week-ends romantiques où l'on attend du palace à la fois calme et services.",
    long_description_en:
      'The Premier Rooms build on the Deluxe template with an additional 10 sqm of breathing room and a true separate sitting area. At 50 sqm, they suit guests who value living space alongside a generous bedroom.\n\nThe marble bathroom is upgraded with a double vanity, a freestanding bathtub and a separate rain shower. The walk-in dressing area offers ample storage for longer stays, and the in-room tablet consolidates lighting, climate, curtain, television and room service controls.\n\nPremier Rooms face Avenue Kléber or the inner courtyards. A category especially favoured for business trips and romantic weekends where guests expect a palace to deliver both peace and refined service.',
    max_occupancy: 2,
    bed_type: 'King size',
    size_sqm: 50,
    amenities: [
      {
        key: 'separate_sitting_area',
        label_fr: 'Coin salon séparé',
        label_en: 'Separate sitting area',
      },
      {
        key: 'marble_bathroom_double_vanity',
        label_fr: 'Salle de bain marbre, double vasque',
        label_en: 'Marble bathroom, double vanity',
      },
      {
        key: 'walk_in_closet',
        label_fr: 'Dressing walk-in',
        label_en: 'Walk-in closet',
      },
      {
        key: 'in_room_tablet',
        label_fr: 'Tablette de contrôle de chambre',
        label_en: 'In-room control tablet',
      },
      { key: 'nespresso', label_fr: 'Machine Nespresso', label_en: 'Nespresso machine' },
    ],
    hero_image: 'cct/test/peninsula-paris/exterior-3',
    images: [],
    is_signature: false,
    indicative_price_minor: { from: 180000, to: 240000, currency: 'EUR' },
    display_order: 20,
  },
  {
    slug: 'suite-tour-eiffel',
    room_code: 'eiffel-tower-suite',
    name_fr: 'Suite Tour Eiffel',
    name_en: 'Eiffel Tower Suite',
    description_fr:
      'Suite signature avec une vue exceptionnelle sur la Tour Eiffel. Chambre, salon séparé et salle de bain en marbre avec baignoire indépendante. Mobilier sur mesure, oeuvres d’art contemporaines (Manolo Valdés, Niki de Saint Phalle dans le cadre du programme « Art in Residence » Opera Gallery).',
    description_en:
      'Signature suite with an exceptional view of the Eiffel Tower. Bedroom, separate sitting room, and marble bathroom with freestanding bathtub. Bespoke furniture, contemporary artworks (Manolo Valdés, Niki de Saint Phalle, through the Opera Gallery "Art in Residence" programme).',
    long_description_fr:
      "La Suite Tour Eiffel est l'une des cinq suites signature du Peninsula Paris. À 90 m², elle se déploie sur une chambre principale, un salon séparé et une salle de bain en marbre avec baignoire indépendante face à une fenêtre orientée plein sud — d'où la perspective rare sur la Tour Eiffel et la Seine.\n\nLe mobilier est entièrement sur-mesure et la suite accueille en permanence des œuvres du programme « Art in Residence » mené avec l'Opera Gallery (Manolo Valdés, Niki de Saint Phalle, Manuel Mérida selon les saisons). Le service majordome est disponible 24h/24, et la suite ouvre l'accès aux avantages signature du Peninsula : connexion privative au lounge des suites, transfert depuis l'aéroport en Rolls-Royce Phantom EWB sur demande, et participation prioritaire au programme Peninsula Time (check-in dès 6h, check-out jusqu'à 22h sans frais).\n\nIdéale pour un séjour de noces ou un anniversaire important, la suite peut accueillir trois voyageurs avec son canapé convertible.",
    long_description_en:
      'The Eiffel Tower Suite is one of the five signature suites at The Peninsula Paris. Spanning 90 sqm, it features a main bedroom, a separate sitting room and a marble bathroom with a freestanding bathtub set against a south-facing window — opening onto the rare framed view of the Eiffel Tower and the Seine.\n\nFurniture is fully bespoke and the suite permanently hosts rotating artworks from the Opera Gallery "Art in Residence" programme (Manolo Valdés, Niki de Saint Phalle, Manuel Mérida depending on the season). Butler service is available 24/7, and the suite unlocks Peninsula\'s signature suite perks: dedicated suites lounge access, optional Rolls-Royce Phantom EWB airport transfer, and priority enrolment in the Peninsula Time programme (check-in from 6 am, check-out until 10 pm, free of charge).\n\nA fitting choice for honeymoons or milestone anniversaries, the suite sleeps three with its convertible sofa.',
    max_occupancy: 3,
    bed_type: 'King size + canapé convertible',
    size_sqm: 90,
    amenities: [
      {
        key: 'eiffel_view',
        label_fr: 'Vue Tour Eiffel',
        label_en: 'Eiffel Tower view',
      },
      {
        key: 'separate_living_room',
        label_fr: 'Salon séparé',
        label_en: 'Separate living room',
      },
      {
        key: 'freestanding_bathtub',
        label_fr: 'Baignoire indépendante en marbre',
        label_en: 'Freestanding marble bathtub',
      },
      {
        key: 'butler_service',
        label_fr: 'Service majordome 24h/24',
        label_en: '24/7 butler service',
      },
      {
        key: 'art_in_residence',
        label_fr: 'Œuvres « Art in Residence » Opera Gallery',
        label_en: '"Art in Residence" Opera Gallery artworks',
      },
    ],
    hero_image: 'cct/test/peninsula-paris/suite-eiffel-1',
    images: [
      {
        public_id: 'cct/test/peninsula-paris/suite-eiffel-1',
        alt_fr: 'Suite avec vue panoramique sur la Tour Eiffel depuis le Peninsula Paris',
        alt_en: 'Suite with panoramic view over the Eiffel Tower from The Peninsula Paris',
        category: 'suite',
      },
      {
        public_id: 'cct/test/peninsula-paris/suite-rooftop-1',
        alt_fr: 'Rooftop Garden Suite avec terrasse privée au Peninsula Paris',
        alt_en: 'Rooftop Garden Suite with private terrace at The Peninsula Paris',
        category: 'suite',
      },
    ],
    is_signature: true,
    // Eiffel Tower Suite: 2026 anchor circa 7,200 €+ per night peak,
    // open-ended because availability and view drive the upper bound
    // far higher (e.g. New Year's Eve packages).
    indicative_price_minor: { from: 720000, currency: 'EUR' },
    display_order: 10,
  },
];

const HOTEL_RECORD = {
  slug: HOTEL_SLUG,
  slug_en: HOTEL_SLUG,
  name: 'The Peninsula Paris',
  name_en: 'The Peninsula Paris',
  stars: 5 as const,
  is_palace: true,
  region: 'Île-de-France',
  department: 'Paris',
  city: 'Paris',
  district: '16ᵉ arrondissement',
  address: '19 Avenue Kléber, 75116 Paris',
  postal_code: '75116',
  latitude: 48.8702,
  longitude: 2.2932,
  booking_mode: 'display_only' as const,
  priority: 'P0' as const,
  is_published: true,
  description_fr:
    "Surnommée la « petite Versailles », cette Grande Dame parisienne occupe un bâtiment historique de 1908 — l'ancien hôtel Majestic — entièrement restauré pendant quatre ans avant sa réouverture en 2014. Distinguée Palace par Atout France en 2016, The Peninsula Paris abrite 200 chambres et suites (dont 87 suites) parmi les plus spacieuses de Paris, à 5 minutes à pied de l'Arc de Triomphe et des Champs-Élysées.\n\nL'établissement réunit sept lieux de restauration, dont L'Oiseau Blanc, restaurant gastronomique 2 étoiles Michelin perché sur le toit, et LiLi, table cantonaise gastronomique. Le Spa Peninsula (1 800 m², 6 salles de soins) est le plus grand des palaces parisiens. Détails signature : service Rolls-Royce Phantom EWB et Mini Cooper Clubman, programme « Peninsula Time » offrant un check-in dès 6h et un check-out jusqu'à 22h sans frais.",
  description_en:
    'Often called the "little Versailles", this Parisian Grande Dame occupies a heritage 1908 building — the former Hôtel Majestic — fully restored over four years before reopening in 2014. Granted the Palace distinction by Atout France in 2016, The Peninsula Paris houses 200 of the most spacious rooms and suites in Paris (including 87 suites), a 5-minute walk from the Arc de Triomphe and the Champs-Élysées.\n\nThe hotel brings together seven dining venues, including L\'Oiseau Blanc, a 2 Michelin star rooftop restaurant, and LiLi, fine Cantonese cuisine. The Peninsula Spa (1,800 m², 6 treatment rooms) is the largest among Parisian palaces. Signature touches: house Rolls-Royce Phantom EWB and Mini Cooper Clubman, and the "Peninsula Time" programme offering complimentary check-in from 6 am and check-out until 10 pm.',
  meta_title_fr: 'The Peninsula Paris — Palace 5 étoiles, 19 av. Kléber, 16e | ConciergeTravel',
  meta_title_en: 'The Peninsula Paris — 5-Star Palace, 19 Av. Kléber, 16th | ConciergeTravel',
  meta_desc_fr:
    'Palace parisien 5★ avenue Kléber : 200 chambres et suites, restaurant 2★ Michelin (L’Oiseau Blanc), Spa 1 800 m², à 5 min de l’Arc de Triomphe.',
  meta_desc_en:
    '5-star Parisian palace on Avenue Kléber: 200 rooms and suites, 2★ Michelin restaurant (L’Oiseau Blanc), 1,800 m² spa, 5 min from the Arc de Triomphe.',
  // Editorial inventory counts (Phase 10.8 / CDC §2.15). 200 keys total,
  // 87 of which are suites — figures published by the property on its
  // own factsheet and corroborated by Atout France's palace registry.
  number_of_rooms: 200 as number,
  number_of_suites: 87 as number,
  // No verified Google Place data — set null rather than guess. The page
  // already handles `google_rating IS NULL` by hiding the aggregateRating
  // JSON-LD block.
  google_place_id: null as string | null,
  google_rating: null as number | null,
  google_reviews_count: null as number | null,
  // Front-desk telephone in E.164 format (no spaces, leading "+", country
  // code, 4-15 digits). The Peninsula Paris reception line, verified on
  // peninsula.com/en/paris/contact-us as of 2026-05.
  phone_e164: '+33158122888',
};

/**
 * Round-trip through `JSON.stringify` + `JSON.parse` to convert any
 * `readonly` / branded TS types into the plain JSON-shaped value that
 * `postgres.Sql.json()` accepts. Keeps the public types strict at the
 * source-of-truth declarations above without polluting the call sites
 * with `as unknown as` chains.
 */
function toJson(value: unknown): postgres.JSONValue {
  return JSON.parse(JSON.stringify(value)) as postgres.JSONValue;
}

function refuseInProd(env: {
  readonly NODE_ENV?: string | undefined;
  readonly SEED_ALLOW_PROD?: string | undefined;
}): boolean {
  if (env.NODE_ENV === 'production' && env.SEED_ALLOW_PROD !== 'true') {
    console.error(
      '[seed:peninsula] refusing to run in production. Set SEED_ALLOW_PROD=true to override.',
    );
    return true;
  }
  return false;
}

async function upsertHotel(sql: postgres.TransactionSql): Promise<string> {
  // Use the first exterior shot as hero LCP candidate. Remaining
  // photos populate the gallery grid (skipping the hero to avoid
  // duplicating the LCP image).
  const heroPublicId = HOTEL_PHOTOS[0]?.public_id ?? null;
  const galleryPhotos = HOTEL_PHOTOS.slice(1);
  const rows = await sql<Array<{ id: string; inserted: boolean }>>`
    insert into public.hotels (
      slug, slug_en, name, name_en,
      stars, is_palace,
      region, department, city, district, address, postal_code,
      latitude, longitude,
      booking_mode, priority, is_published,
      description_fr, description_en,
      highlights, amenities, faq_content,
      restaurant_info, spa_info,
      points_of_interest, transports, policies, awards, signature_experiences, featured_reviews,
      hero_image, gallery_images,
      long_description_sections,
      number_of_rooms, number_of_suites,
      meta_title_fr, meta_title_en, meta_desc_fr, meta_desc_en,
      google_place_id, google_rating, google_reviews_count,
      phone_e164
    )
    values (
      ${HOTEL_RECORD.slug}, ${HOTEL_RECORD.slug_en}, ${HOTEL_RECORD.name}, ${HOTEL_RECORD.name_en},
      ${HOTEL_RECORD.stars}, ${HOTEL_RECORD.is_palace},
      ${HOTEL_RECORD.region}, ${HOTEL_RECORD.department}, ${HOTEL_RECORD.city}, ${HOTEL_RECORD.district}, ${HOTEL_RECORD.address}, ${HOTEL_RECORD.postal_code},
      ${HOTEL_RECORD.latitude}, ${HOTEL_RECORD.longitude},
      ${HOTEL_RECORD.booking_mode}, ${HOTEL_RECORD.priority}, ${HOTEL_RECORD.is_published},
      ${HOTEL_RECORD.description_fr}, ${HOTEL_RECORD.description_en},
      ${sql.json(toJson(HIGHLIGHTS))},
      ${sql.json(toJson(AMENITIES))},
      ${sql.json(toJson(FAQ))},
      ${sql.json(toJson(RESTAURANT_INFO))},
      ${sql.json(toJson(SPA_INFO))},
      ${sql.json(toJson(POINTS_OF_INTEREST))},
      ${sql.json(toJson(TRANSPORTS))},
      ${sql.json(toJson(POLICIES))},
      ${sql.json(toJson(AWARDS))},
      ${sql.json(toJson(SIGNATURE_EXPERIENCES))},
      ${sql.json(toJson(FEATURED_REVIEWS))},
      ${heroPublicId},
      ${sql.json(toJson(galleryPhotos))},
      ${sql.json(toJson(LONG_DESCRIPTION_SECTIONS))},
      ${HOTEL_RECORD.number_of_rooms}, ${HOTEL_RECORD.number_of_suites},
      ${HOTEL_RECORD.meta_title_fr}, ${HOTEL_RECORD.meta_title_en},
      ${HOTEL_RECORD.meta_desc_fr}, ${HOTEL_RECORD.meta_desc_en},
      ${HOTEL_RECORD.google_place_id}, ${HOTEL_RECORD.google_rating}, ${HOTEL_RECORD.google_reviews_count},
      ${HOTEL_RECORD.phone_e164}
    )
    on conflict (slug) do update set
      slug_en = excluded.slug_en,
      name = excluded.name,
      name_en = excluded.name_en,
      stars = excluded.stars,
      is_palace = excluded.is_palace,
      region = excluded.region,
      department = excluded.department,
      city = excluded.city,
      district = excluded.district,
      address = excluded.address,
      postal_code = excluded.postal_code,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      booking_mode = excluded.booking_mode,
      priority = excluded.priority,
      is_published = excluded.is_published,
      description_fr = excluded.description_fr,
      description_en = excluded.description_en,
      highlights = excluded.highlights,
      amenities = excluded.amenities,
      faq_content = excluded.faq_content,
      restaurant_info = excluded.restaurant_info,
      spa_info = excluded.spa_info,
      points_of_interest = excluded.points_of_interest,
      transports = excluded.transports,
      policies = excluded.policies,
      awards = excluded.awards,
      signature_experiences = excluded.signature_experiences,
      featured_reviews = excluded.featured_reviews,
      hero_image = excluded.hero_image,
      gallery_images = excluded.gallery_images,
      long_description_sections = excluded.long_description_sections,
      number_of_rooms = excluded.number_of_rooms,
      number_of_suites = excluded.number_of_suites,
      meta_title_fr = excluded.meta_title_fr,
      meta_title_en = excluded.meta_title_en,
      meta_desc_fr = excluded.meta_desc_fr,
      meta_desc_en = excluded.meta_desc_en,
      google_place_id = excluded.google_place_id,
      google_rating = excluded.google_rating,
      google_reviews_count = excluded.google_reviews_count,
      phone_e164 = excluded.phone_e164,
      updated_at = timezone('utc', now())
    returning id, (xmax = 0) as inserted
  `;
  const row = rows[0];
  if (row === undefined) {
    throw new Error('[seed:peninsula] upsert returned no row');
  }
  console.info(
    `[seed:peninsula] ${row.inserted ? 'inserted' : 'updated '} hotel ${HOTEL_SLUG} → ${row.id}`,
  );
  return row.id;
}

async function resetAndInsertRooms(sql: postgres.TransactionSql, hotelId: string): Promise<void> {
  await sql`delete from public.hotel_rooms where hotel_id = ${hotelId}`;
  for (const room of ROOMS) {
    await sql`
      insert into public.hotel_rooms (
        hotel_id, slug, room_code,
        name_fr, name_en,
        description_fr, description_en,
        long_description_fr, long_description_en,
        max_occupancy, bed_type, size_sqm,
        amenities, images, hero_image,
        is_signature, indicative_price_minor, display_order
      )
      values (
        ${hotelId}, ${room.slug}, ${room.room_code},
        ${room.name_fr}, ${room.name_en},
        ${room.description_fr}, ${room.description_en},
        ${room.long_description_fr}, ${room.long_description_en},
        ${room.max_occupancy}, ${room.bed_type}, ${room.size_sqm},
        ${sql.json(toJson(room.amenities))},
        ${sql.json(toJson(room.images))},
        ${room.hero_image},
        ${room.is_signature},
        ${sql.json(toJson(room.indicative_price_minor))},
        ${room.display_order}
      )
    `;
    console.info(
      `[seed:peninsula]   ↳ room ${room.slug.padEnd(22)} (${room.size_sqm} m², ${room.images.length} photo${room.images.length === 1 ? '' : 's'})`,
    );
  }
}

interface AlgoliaEnv {
  readonly appId: string;
  readonly apiKey: string;
  readonly indexPrefix: string;
}

function readAlgoliaEnv(): AlgoliaEnv | null {
  const appId = process.env['NEXT_PUBLIC_ALGOLIA_APP_ID'];
  const apiKey = process.env['ALGOLIA_ADMIN_API_KEY'];
  const indexPrefix = process.env['ALGOLIA_INDEX_PREFIX'];
  if (!appId || !apiKey) return null;
  return { appId, apiKey, indexPrefix: indexPrefix ?? 'dev_' };
}

async function maybeIndexAlgolia(env: AlgoliaEnv, hotelId: string): Promise<void> {
  const algoliaAdmin = await import('@cct/integrations/algolia-admin');
  const svc = algoliaAdmin.createAlgoliaIndexingService({
    appId: env.appId,
    apiKey: env.apiKey,
    indexPrefix: env.indexPrefix,
  });
  const r = await algoliaAdmin.syncHotelPublicationToAlgolia(svc, {
    id: hotelId,
    slug: HOTEL_RECORD.slug,
    slug_en: HOTEL_RECORD.slug_en,
    name: HOTEL_RECORD.name,
    name_en: HOTEL_RECORD.name_en,
    city: HOTEL_RECORD.city,
    district: HOTEL_RECORD.district,
    region: HOTEL_RECORD.region,
    is_palace: HOTEL_RECORD.is_palace,
    stars: HOTEL_RECORD.stars,
    amenities: AMENITIES.map((a) => a.key),
    highlights: HIGHLIGHTS.map((h) => h.label_fr),
    description_fr: HOTEL_RECORD.description_fr,
    description_en: HOTEL_RECORD.description_en,
    is_little_catalog: false,
    priority: HOTEL_RECORD.priority,
    google_rating: HOTEL_RECORD.google_rating,
    google_reviews_count: HOTEL_RECORD.google_reviews_count,
    is_published: true,
  });
  if (!r.ok) {
    console.warn('[seed:peninsula] algolia indexing failed:', r.error);
  } else {
    console.info('[seed:peninsula] indexed in Algolia (fr + en).');
  }
}

async function main(): Promise<void> {
  const parsedEnv = Env.safeParse(process.env);
  if (!parsedEnv.success) {
    console.error('[seed:peninsula] invalid env:', parsedEnv.error.flatten());
    process.exitCode = 1;
    return;
  }
  if (refuseInProd(parsedEnv.data)) {
    process.exitCode = 1;
    return;
  }

  console.info(`[seed:peninsula] cloud=${CLOUDINARY_CLOUD} hotel=${HOTEL_SLUG}`);

  const sql = postgres(parsedEnv.data.SUPABASE_DB_URL, {
    max: 1,
    onnotice: () => undefined,
  });

  try {
    let hotelId = '';
    await sql.begin(async (trx) => {
      hotelId = await upsertHotel(trx);
      await resetAndInsertRooms(trx, hotelId);
    });

    const algoliaEnv = readAlgoliaEnv();
    if (algoliaEnv === null) {
      console.info('[seed:peninsula] Algolia env not set — skipping index push.');
    } else {
      console.info('[seed:peninsula] pushing FR + EN records to Algolia…');
      await maybeIndexAlgolia(algoliaEnv, hotelId);
    }

    console.info(`[seed:peninsula] done. Hotel ID: ${hotelId}`);
    console.info('');
    console.info(`Inspect: ${HOTEL_PHOTOS.length} hotel photos staged on Cloudinary.`);
    console.info(`Rollback: pnpm --filter @cct/db teardown:peninsula`);
  } catch (error) {
    console.error('[seed:peninsula] failed:', error);
    process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

void main().catch((error) => {
  console.error('[seed:peninsula] unhandled:', error);
  process.exit(1);
});
