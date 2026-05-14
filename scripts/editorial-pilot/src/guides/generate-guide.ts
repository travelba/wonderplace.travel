/**
 * Generates a single destination guide via the LLM pipeline.
 *
 * Output shape mirrors the `editorial_guides` DB schema (migration 0026):
 *   - 6-9 long-form sections (≥ 350 words each, total ≥ 1800 words)
 *   - 8-12 FAQ entries
 *   - 6-12 highlight cards (curated attractions)
 *   - practical_info (when_to_visit, currency, language, airports, trains)
 *   - bilingual FR/EN (the same call returns both locales)
 *
 * Anti-hallucination contract:
 *   - The prompt is anchored by a `keywords` allowlist drawn from
 *     `destinations-catalog.ts` (the only "facts" the AI may rely on).
 *   - Every section ends with the instruction "If you're not sure of
 *     a fact, omit it; do NOT invent dates, names or numbers."
 *   - JSON output (strict mode) so we can fail-fast on shape drift.
 *   - Word-count + section-count enforced by Zod before persistence.
 *
 * Run via:
 *   pnpm --filter @cct/editorial-pilot exec tsx \
 *     src/guides/run-guides.ts --slug=paris
 *   pnpm --filter @cct/editorial-pilot exec tsx \
 *     src/guides/run-guides.ts --all
 */

import { z } from 'zod';
import { buildLlmClient } from '../llm.js';
import { loadEnv, resolveProvider } from '../env.js';
import type { DestinationGuideSeed } from './destinations-catalog.js';

const SECTION_TYPE_ALIASES: Readonly<Record<string, string>> = {
  intro: 'intro',
  introduction: 'intro',
  overview: 'intro',
  history: 'history',
  histoire: 'history',
  heritage: 'history',
  patrimoine: 'history',
  when_to_visit: 'when_to_visit',
  when: 'when_to_visit',
  best_time: 'when_to_visit',
  seasons: 'when_to_visit',
  saisons: 'when_to_visit',
  what_to_see: 'what_to_see',
  attractions: 'what_to_see',
  see: 'what_to_see',
  sights: 'what_to_see',
  to_see: 'what_to_see',
  gastronomy: 'gastronomy',
  gastronomie: 'gastronomy',
  food: 'gastronomy',
  dining: 'gastronomy',
  restaurants: 'gastronomy',
  cuisine: 'gastronomy',
  art_de_vivre: 'art_de_vivre',
  lifestyle: 'art_de_vivre',
  culture: 'art_de_vivre',
  cultural: 'art_de_vivre',
  arts: 'art_de_vivre',
  luxury: 'art_de_vivre',
  palaces: 'palaces',
  hotels: 'palaces',
  hôtels: 'palaces',
  hotels_palaces: 'palaces',
  shopping: 'shopping',
  boutiques: 'shopping',
  fashion: 'shopping',
  retail: 'shopping',
  transports: 'transports',
  transport: 'transports',
  transportation: 'transports',
  access: 'transports',
  practical: 'practical',
  practical_info: 'practical',
  practical_information: 'practical',
  pratique: 'practical',
  conclusion: 'conclusion',
  outro: 'conclusion',
  closing: 'conclusion',
  summary: 'conclusion',
};

const SectionSchema = z.object({
  key: z
    .string()
    .regex(/^[a-z0-9_-]+$/u)
    .optional()
    .default(''),
  type: z.preprocess(
    (v) => {
      if (typeof v !== 'string') return v;
      const k = v
        .trim()
        .toLowerCase()
        .replace(/[-\s]+/gu, '_');
      return SECTION_TYPE_ALIASES[k] ?? 'art_de_vivre';
    },
    z
      .enum([
        'intro',
        'history',
        'when_to_visit',
        'what_to_see',
        'gastronomy',
        'art_de_vivre',
        'palaces',
        'shopping',
        'transports',
        'practical',
        'conclusion',
      ])
      .default('art_de_vivre'),
  ),
  title_fr: z.string().min(4).max(160),
  title_en: z.string().min(4).max(160).optional().default(''),
  body_fr: z.string().min(200),
  body_en: z.string().min(100).optional().default(''),
});

// Tolerant FAQ — accepts a single locale and fills the other with an
// empty string so the editor / the page can fall back gracefully.
const FaqSchema = z
  .object({
    question_fr: z.string().max(220).optional().default(''),
    question_en: z.string().max(220).optional().default(''),
    answer_fr: z.string().max(1200).optional().default(''),
    answer_en: z.string().max(1200).optional().default(''),
    category: z.preprocess(
      (v) => {
        if (typeof v !== 'string') return v;
        const k = v.trim().toLowerCase();
        const map: Readonly<Record<string, string>> = {
          before: 'before',
          avant: 'before',
          pre: 'before',
          prepare: 'before',
          preparation: 'before',
          transport: 'before',
          transports: 'before',
          access: 'before',
          access_transports: 'before',
          arrival: 'before',
          arrivee: 'before',
          arrivée: 'before',
          lodging: 'before',
          hotels: 'before',
          stay: 'before',
          during: 'during',
          pendant: 'during',
          events: 'during',
          experiences: 'during',
          experience: 'during',
          gastronomy: 'during',
          food: 'during',
          weather: 'during',
          safety: 'during',
          sécurité: 'during',
          securite: 'during',
          after: 'after',
          apres: 'after',
          après: 'after',
          practical: 'practical',
          pratique: 'practical',
          budget: 'practical',
          money: 'practical',
          currency: 'practical',
          language: 'practical',
          languages: 'practical',
          geo: 'geo',
          geographic: 'geo',
          geography: 'geo',
          location: 'geo',
        };
        return map[k] ?? 'practical';
      },
      z.enum(['before', 'during', 'after', 'practical', 'geo']).default('practical'),
    ),
  })
  .refine((f) => f.question_fr.length > 0 || f.question_en.length > 0, {
    message: 'at least one of question_fr/question_en is required',
  });

const HIGHLIGHT_TYPE_ALIASES: Readonly<Record<string, string>> = {
  // FR synonyms emitted by the LLM in spite of the English allowlist.
  musée: 'museum',
  musee: 'museum',
  monument: 'monument',
  monuments: 'monument',
  parc: 'park',
  jardin: 'park',
  jardins: 'park',
  plage: 'beach',
  plages: 'beach',
  shopping: 'shopping',
  boutique: 'shopping',
  boutiques: 'shopping',
  magasin: 'shopping',
  rue: 'shopping',
  avenue: 'shopping',
  restaurant: 'restaurant',
  restaurants: 'restaurant',
  table: 'restaurant',
  bistrot: 'restaurant',
  experience: 'experience',
  expérience: 'experience',
  experiences: 'experience',
  belvédère: 'viewpoint',
  belvedere: 'viewpoint',
  viewpoint: 'viewpoint',
  panorama: 'viewpoint',
  église: 'church',
  eglise: 'church',
  cathédrale: 'church',
  cathedrale: 'church',
  basilique: 'church',
  basilica: 'church',
  church: 'church',
  cathedral: 'church',
  quartier: 'landmark',
  district: 'landmark',
  neighbourhood: 'landmark',
  neighborhood: 'landmark',
  place: 'landmark',
  square: 'landmark',
  square_alias: 'landmark',
  pont: 'landmark',
  bridge: 'landmark',
  landmark: 'landmark',
  theatre: 'experience',
  theater: 'experience',
  opera: 'experience',
  opéra: 'experience',
  concert: 'experience',
  hall: 'experience',
  cinema: 'experience',
  cinéma: 'experience',
  hotel: 'landmark',
  hôtel: 'landmark',
  palace: 'landmark',
  fortress: 'monument',
  castle: 'monument',
  citadelle: 'monument',
  citadel: 'monument',
  chateau: 'monument',
  château: 'monument',
  tower: 'monument',
  tour: 'monument',
  arch: 'monument',
  arc: 'monument',
  obelisk: 'monument',
  fountain: 'monument',
  fontaine: 'monument',
  statue: 'monument',
  market: 'shopping',
  marché: 'shopping',
  marche: 'shopping',
  galerie: 'shopping',
  gallery: 'museum',
  exhibition: 'museum',
  port: 'landmark',
  harbour: 'landmark',
  harbor: 'landmark',
  bay: 'viewpoint',
  baie: 'viewpoint',
  cap: 'viewpoint',
  cape: 'viewpoint',
  island: 'landmark',
  ile: 'landmark',
  île: 'landmark',
  village: 'landmark',
  ville: 'landmark',
  city: 'landmark',
  vineyard: 'experience',
  vignoble: 'experience',
  cave: 'experience',
  spa: 'experience',
  thalasso: 'experience',
  golf: 'experience',
  ski: 'experience',
  trail: 'experience',
  sentier: 'experience',
  promenade: 'experience',
  walk: 'experience',
  cliff: 'viewpoint',
  falaise: 'viewpoint',
  panorama_alias: 'viewpoint',
  belvedere_alias: 'viewpoint',
  area: 'landmark',
  zone: 'landmark',
  museum: 'museum',
  park: 'park',
  beach: 'beach',
};

const HIGHLIGHT_TYPE_VALUES = [
  'monument',
  'museum',
  'park',
  'beach',
  'shopping',
  'restaurant',
  'experience',
  'viewpoint',
  'church',
  'landmark',
] as const;

const HighlightSchema = z.object({
  name_fr: z.string().min(2).max(160),
  name_en: z.string().min(2).max(160).optional().default(''),
  type: z.preprocess((v) => {
    if (typeof v !== 'string') return v;
    const k = v
      .trim()
      .toLowerCase()
      .replace(/[-\s]+/gu, '_');
    const mapped = HIGHLIGHT_TYPE_ALIASES[k];
    if (mapped !== undefined) return mapped;
    // Unknown type → fallback to 'landmark' (never break the build).
    return (HIGHLIGHT_TYPE_VALUES as readonly string[]).includes(k) ? k : 'landmark';
  }, z.enum(HIGHLIGHT_TYPE_VALUES).default('landmark')),
  description_fr: z.string().min(20).max(600),
  description_en: z.string().max(600).optional().default(''),
  url: z.string().url().optional().nullable(),
});

const AirportSchema = z.object({
  code: z
    .string()
    .regex(/^[A-Z]{3}$/u)
    .optional()
    .nullable(),
  name: z.string().min(2).max(200),
  distance_fr: z.string().max(220).optional().default(''),
  distance_en: z.string().max(220).optional().default(''),
});

const TrainStationSchema = z.object({
  name: z.string().min(2).max(200),
  notes_fr: z.string().max(360).optional().default(''),
  notes_en: z.string().max(360).optional().default(''),
});

const PracticalInfoSchema = z.object({
  best_time_fr: z.string().min(20).max(800),
  best_time_en: z.string().max(800).optional().default(''),
  currency: z.string().default('EUR'),
  languages_fr: z.string().default('Français, anglais'),
  languages_en: z.string().default('French, English'),
  airports: z.array(AirportSchema).min(1).max(6),
  train_stations: z.array(TrainStationSchema).max(6).default([]),
});

export const GeneratedGuideSchema = z.object({
  summary_fr: z.string().min(60).max(260),
  summary_en: z.string().min(40).max(260).optional().default(''),
  meta_title_fr: z.string().min(15).max(90),
  meta_title_en: z.string().min(15).max(90).optional().default(''),
  meta_desc_fr: z.string().min(50).max(220),
  meta_desc_en: z.string().min(40).max(240).optional().default(''),
  sections: z.array(SectionSchema).min(4).max(12),
  faq: z.array(FaqSchema).min(4).max(20),
  highlights: z.array(HighlightSchema).min(4).max(16),
  practical_info: PracticalInfoSchema,
});

export type GeneratedGuide = z.infer<typeof GeneratedGuideSchema>;

const SYSTEM_PROMPT = `Tu es un rédacteur éditorial spécialisé dans le luxe hôtelier français pour ConciergeTravel.fr (conciergerie agréée IATA spécialisée dans les Palaces et hôtels 5 étoiles en France).

Ton style :
- Voix éditoriale "guide haut-de-gamme", proche d'un long-read Condé Nast Traveler / Travel + Leisure
- Précis, factuel, intemporel — JAMAIS de superlatifs creux ("incroyable", "magique", "à couper le souffle")
- Pas d'adresses inventées, pas de prix inventés, pas de dates inventées
- Si tu n'es pas certain à 100 % d'un fait, OMETS-LE. Ne jamais halluciner.
- Pas de marketing direct ("réservez maintenant", "ne manquez pas")
- Tone neutre, respectueux, érudit

Format de sortie : JSON strict suivant le schéma fourni. Tous les textes en français ET en anglais britannique (en-GB).

Anti-hallucination obligatoire :
- Tu DOIS t'appuyer EXCLUSIVEMENT sur les "keywords" fournis dans le prompt utilisateur
- Tu peux compléter par tes connaissances générales SI elles sont vérifiables (Wikipédia niveau)
- Tu ne dois JAMAIS citer un Palace, un restaurant, un événement qui n'est pas dans les keywords sauf s'il est universellement connu (Tour Eiffel, Louvre, etc.)
- Pour les dates : préfère un siècle ou une décennie à une année précise sauf si certain (ex: "fondé au XIXe siècle" plutôt que "fondé en 1857" si tu n'es pas sûr)
- Pour les distances/temps de trajet : utilise des approximations ("environ 1h30 de Paris") plutôt qu'une valeur précise`;

function buildUserPrompt(dest: DestinationGuideSeed): string {
  const sections: string[] = [];
  sections.push(`Destination : **${dest.nameFr}** (${dest.scope}, ${dest.countryCode})`);
  sections.push(`Ton éditorial : ${dest.toneFr}`);
  sections.push(`Slug URL : ${dest.slug}`);
  sections.push('');
  sections.push(
    '### Faits / keywords vérifiés (utilise EXCLUSIVEMENT ces éléments + connaissances Wikipédia niveau)',
  );
  for (const k of dest.keywordsFr) sections.push(`- ${k}`);
  sections.push('');
  sections.push('### Contraintes éditoriales');
  sections.push(
    '1. Génère 6 à 9 sections éditoriales (champ `sections`). Chaque `body_fr` doit faire au moins 350 mots, idéalement 450-600. Total minimum : 1800 mots FR.',
  );
  sections.push(
    '2. Sections recommandées : intro, history, when_to_visit, what_to_see, gastronomy, art_de_vivre (ou palaces), transports, conclusion. Adapte selon la destination.',
  );
  sections.push(
    '3. Génère 8 à 15 FAQ très concrètes (champ `faq`). Couvre : meilleur moment pour visiter, comment s\'y rendre, où loger (mentionne "Palaces de notre sélection ConciergeTravel"), gastronomie, événements, sécurité, budget approximatif, langues.',
  );
  sections.push(
    '4. Génère 6 à 14 highlights (champ `highlights`) — attractions/lieux notables. Chacun avec name_fr, name_en, type, description_fr (≥ 40 mots), description_en, url optionnel (Wikipedia).',
  );
  sections.push(
    '5. Renseigne `practical_info` avec : best_time_fr (saisonnier détaillé), airports (1 à 4 entries avec code IATA si connu), train_stations (max 4).',
  );
  sections.push('6. `summary_fr` et `summary_en` : 100-160 caractères pour la meta description.');
  sections.push(
    '7. `meta_title_fr` et `meta_title_en` : ≤ 65 caractères, intégrant le nom + "Guide voyage luxe" ou équivalent.',
  );
  sections.push(
    '8. `meta_desc_fr` et `meta_desc_en` : 120-160 caractères, accrocheurs mais factuels.',
  );
  sections.push(
    '9. Mentionne les Palaces de notre sélection ConciergeTravel UNIQUEMENT s\'ils sont dans les keywords. Sinon dis "les Palaces de notre sélection" sans nom.',
  );
  sections.push(
    '10. JAMAIS de prix ni de tarifs concrets. Tu peux dire "le segment ultra-luxe" ou "grands Palaces".',
  );
  sections.push('11. Anglais britannique (en-GB) — orthographe "colour", "favourite", "centre".');
  sections.push('');
  sections.push('### Schema JSON OBLIGATOIRE');
  sections.push(
    'Tous les champs en _fr ET _en. type de section parmi : intro, history, when_to_visit, what_to_see, gastronomy, art_de_vivre, palaces, shopping, transports, practical, conclusion. type de highlight parmi : monument, museum, park, beach, shopping, restaurant, experience, viewpoint, church, landmark. category de FAQ parmi : before, during, after, practical, geo.',
  );
  sections.push('');
  sections.push('Structure :');
  sections.push(
    '{ summary_fr, summary_en, meta_title_fr, meta_title_en, meta_desc_fr, meta_desc_en, sections:[{key,type,title_fr,title_en,body_fr,body_en}], faq:[{question_fr,question_en,answer_fr,answer_en,category}], highlights:[{name_fr,name_en,type,description_fr,description_en,url?}], practical_info:{best_time_fr,best_time_en,currency,languages_fr,languages_en,airports:[{code?,name,distance_fr,distance_en}],train_stations:[{name,notes_fr,notes_en}]} }',
  );
  sections.push('');
  sections.push('Quantités MINIMALES (impératif, ne pas tronquer) :');
  sections.push(
    '- 7-8 sections, chacune body_fr DOIT faire 350-500 mots (compte les mots avant de finir, vise au moins 350)',
  );
  sections.push('- 10 FAQ, chacune answer_fr ≥ 60 mots');
  sections.push('- 8 highlights, chacune description_fr ≥ 40 mots');
  sections.push('- 2-3 airports + 1-2 train_stations');
  sections.push('- TOTAL body_fr sur tout le guide : MINIMUM 2200 mots, idéal 2800-3200 mots');
  sections.push('');
  sections.push(
    'Tu DOIS produire un long-read éditorial complet, pas un résumé. Chaque section est un paragraphe substantiel de magazine.',
  );
  sections.push('');
  sections.push('Retourne UNIQUEMENT le JSON. Pas de markdown, pas de commentaire.');
  return sections.join('\n');
}

export async function generateGuide(dest: DestinationGuideSeed): Promise<GeneratedGuide> {
  const env = loadEnv();
  const provider = resolveProvider(env);
  const client = buildLlmClient(env, provider);

  const result = await client.call({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: buildUserPrompt(dest),
    temperature: 0.55,
    // 16k generous — typical guide weighs ~5-7k completion tokens, but
    // a "cluster" scope (Alpes, Côte d'Azur) easily reaches 8-10k.
    maxOutputTokens: 16000,
    responseFormat: 'json',
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.content);
  } catch (err) {
    throw new Error(
      `[generate-guide ${dest.slug}] LLM returned non-JSON (${(err as Error).message}). First 300 chars: ${result.content.slice(0, 300)}`,
    );
  }

  const validation = GeneratedGuideSchema.safeParse(parsed);
  if (!validation.success) {
    const issues = validation.error.issues
      .map((i) => `- ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`[generate-guide ${dest.slug}] LLM output failed schema:\n${issues}`);
  }
  return validation.data;
}
