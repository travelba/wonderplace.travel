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
}

interface CloudinaryImage {
  readonly public_id: string;
  readonly alt_fr: string;
  readonly alt_en: string;
  readonly category: string;
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
    question_fr: "Quelle est l'adresse du Peninsula Paris ?",
    answer_fr:
      'The Peninsula Paris est situé au 19 avenue Kléber, 75116 Paris, dans le 16ᵉ arrondissement, à 5 minutes à pied de l’Arc de Triomphe et des Champs-Élysées.',
    question_en: 'What is the address of The Peninsula Paris?',
    answer_en:
      'The Peninsula Paris is located at 19 Avenue Kléber, 75116 Paris, in the 16th arrondissement, a 5-minute walk from the Arc de Triomphe and the Champs-Élysées.',
  },
  {
    question_fr: 'Quels sont les restaurants du Peninsula Paris ?',
    answer_fr:
      "L'hôtel compte 7 lieux de restauration : L'Oiseau Blanc (rooftop, 2★ Michelin, chef David Bizet), LiLi (cantonais gastronomique), Le Lobby (français et international), Le Bar Kléber, La Terrasse Kléber, Le Rooftop \"L'Heure Dorée\" et le Lounge Kléber Cigar.",
    question_en: 'What restaurants are available at The Peninsula Paris?',
    answer_en:
      'The hotel has 7 dining venues: L\'Oiseau Blanc (rooftop, 2 Michelin stars, chef David Bizet), LiLi (fine Cantonese cuisine), Le Lobby (French and international), Le Bar Kléber, La Terrasse Kléber, the "Golden Hour" Rooftop and the Kléber Cigar Lounge.',
  },
  {
    question_fr: 'Le Peninsula Paris dispose-t-il d’un spa et d’une piscine ?',
    answer_fr:
      "Oui. Le Spa Peninsula est le plus grand parmi les palaces parisiens (1 800 m², 6 salles de soins). L'hôtel propose aussi une piscine intérieure et une salle de sport ouverte 24h/24.",
    question_en: 'Does The Peninsula Paris have a spa and a pool?',
    answer_en:
      'Yes. The Peninsula Spa is the largest among Parisian palaces (1,800 m², 6 treatment rooms). The hotel also offers an indoor pool and a 24/7 fitness centre.',
  },
  {
    question_fr: 'Combien de chambres et suites compte le Peninsula Paris ?',
    answer_fr:
      "L'hôtel dispose de 200 chambres et suites, dont 87 suites, réparties sur 6 étages. Le bâtiment date de 1908 et a été entièrement rénové entre 2010 et 2014.",
    question_en: 'How many rooms and suites does The Peninsula Paris have?',
    answer_en:
      'The hotel has 200 rooms and suites — including 87 suites — across 6 floors. The building dates from 1908 and was fully renovated between 2010 and 2014.',
  },
  {
    question_fr: 'Le Peninsula Paris est-il un palace ?',
    answer_fr:
      'Oui, The Peninsula Paris a reçu la distinction officielle de Palace par Atout France en juillet 2016. Il fait partie des 13 palaces parisiens.',
    question_en: 'Is The Peninsula Paris an officially recognised palace?',
    answer_en:
      'Yes. The Peninsula Paris received the official Palace distinction from Atout France in July 2016. It is one of 13 Parisian palaces.',
  },
  {
    question_fr: 'Quels sont les horaires de check-in et check-out ?',
    answer_fr:
      'Grâce au programme Peninsula Time, l’arrivée est possible dès 6h du matin et le départ jusqu’à 22h, sans frais supplémentaires, sous réserve de disponibilité.',
    question_en: 'What are the check-in and check-out hours?',
    answer_en:
      'Through the Peninsula Time programme, check-in is available from 6 am and check-out until 10 pm, free of charge, subject to availability.',
  },
  {
    question_fr: 'Quels services de transport propose le Peninsula Paris ?',
    answer_fr:
      "L'hôtel met à disposition de ses clients deux Rolls-Royce Phantom EWB et deux Mini Cooper Clubman estampillées Peninsula. L’aéroport Roissy-Charles-de-Gaulle est à 25 km (~30 min).",
    question_en: 'What transport services does The Peninsula Paris offer?',
    answer_en:
      'Guests have access to two Rolls-Royce Phantom EWB and two Peninsula-branded Mini Cooper Clubman. Charles-de-Gaulle airport is 25 km away (~30 min by car).',
  },
  {
    question_fr: 'Les animaux sont-ils acceptés au Peninsula Paris ?',
    answer_fr:
      "Oui, les chiens de petite et moyenne taille sont les bienvenus. Merci de contacter la conciergerie de l'hôtel pour préciser votre demande lors de la réservation.",
    question_en: 'Are pets allowed at The Peninsula Paris?',
    answer_en:
      'Yes, small and medium-sized dogs are welcome. Please contact the hotel concierge to confirm specific requirements when booking.',
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
  // No verified Google Place data — set null rather than guess. The page
  // already handles `google_rating IS NULL` by hiding the aggregateRating
  // JSON-LD block.
  google_place_id: null as string | null,
  google_rating: null as number | null,
  google_reviews_count: null as number | null,
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
      region, department, city, district, address,
      latitude, longitude,
      booking_mode, priority, is_published,
      description_fr, description_en,
      highlights, amenities, faq_content,
      restaurant_info, spa_info,
      hero_image, gallery_images,
      meta_title_fr, meta_title_en, meta_desc_fr, meta_desc_en,
      google_place_id, google_rating, google_reviews_count
    )
    values (
      ${HOTEL_RECORD.slug}, ${HOTEL_RECORD.slug_en}, ${HOTEL_RECORD.name}, ${HOTEL_RECORD.name_en},
      ${HOTEL_RECORD.stars}, ${HOTEL_RECORD.is_palace},
      ${HOTEL_RECORD.region}, ${HOTEL_RECORD.department}, ${HOTEL_RECORD.city}, ${HOTEL_RECORD.district}, ${HOTEL_RECORD.address},
      ${HOTEL_RECORD.latitude}, ${HOTEL_RECORD.longitude},
      ${HOTEL_RECORD.booking_mode}, ${HOTEL_RECORD.priority}, ${HOTEL_RECORD.is_published},
      ${HOTEL_RECORD.description_fr}, ${HOTEL_RECORD.description_en},
      ${sql.json(toJson(HIGHLIGHTS))},
      ${sql.json(toJson(AMENITIES))},
      ${sql.json(toJson(FAQ))},
      ${sql.json(toJson(RESTAURANT_INFO))},
      ${sql.json(toJson(SPA_INFO))},
      ${heroPublicId},
      ${sql.json(toJson(galleryPhotos))},
      ${HOTEL_RECORD.meta_title_fr}, ${HOTEL_RECORD.meta_title_en},
      ${HOTEL_RECORD.meta_desc_fr}, ${HOTEL_RECORD.meta_desc_en},
      ${HOTEL_RECORD.google_place_id}, ${HOTEL_RECORD.google_rating}, ${HOTEL_RECORD.google_reviews_count}
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
      hero_image = excluded.hero_image,
      gallery_images = excluded.gallery_images,
      meta_title_fr = excluded.meta_title_fr,
      meta_title_en = excluded.meta_title_en,
      meta_desc_fr = excluded.meta_desc_fr,
      meta_desc_en = excluded.meta_desc_en,
      google_place_id = excluded.google_place_id,
      google_rating = excluded.google_rating,
      google_reviews_count = excluded.google_reviews_count,
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
        amenities, images, hero_image
      )
      values (
        ${hotelId}, ${room.slug}, ${room.room_code},
        ${room.name_fr}, ${room.name_en},
        ${room.description_fr}, ${room.description_en},
        ${room.long_description_fr}, ${room.long_description_en},
        ${room.max_occupancy}, ${room.bed_type}, ${room.size_sqm},
        ${sql.json(toJson(room.amenities))},
        ${sql.json(toJson(room.images))},
        ${room.hero_image}
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
