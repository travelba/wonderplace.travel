/**
 * v2 generator — produces "long-read" destination guides (≥ 3500
 * words FR, 10-12 sections, 6 tables, glossary, callouts, sources).
 *
 * Architecture: **one LLM call per section** to bypass the GPT-4o
 * conservative-truncation behavior on multi-task prompts. The earlier
 * 3-call design (sections-in-one-go + tables + FAQ) produced ~80
 * words/section instead of the requested 400; isolating each section
 * in its own call removes that token-budget pressure.
 *
 * Pipeline:
 *   Call M (meta)        — summary, meta_title, meta_desc,
 *                          practical_info, highlights, section plan
 *                          (titles + types only).
 *   Calls S₁..Sₙ          — one per section, asking for 400-550 words
 *                          of body_fr. Run in parallel (Promise.all).
 *   Call B (rich blocks) — tables + glossary + callouts (focused).
 *   Call F (faq)         — 25-40 FAQ entries (global + contextual).
 *   Call X (sources)     — external sources, validated against the
 *                          allowlist post-generation.
 *
 * Anti-hallucination guards:
 *   - Section types preprocessed with aliases (relaxed enum).
 *   - External URLs validated against `ALLOWLIST`; unknown dropped.
 *   - Each section call sees only its own brief + the destination
 *     keywords (no risk of cross-section confusion).
 *
 * Output: the consolidated `GeneratedGuideV2` shape mapped 1:1 to the
 * DB columns from migrations 0026 + 0027.
 *
 * Cost: ~16 calls × ~2500 output tokens each ≈ 40k output tokens per
 * guide, ~$0.60 per guide on gpt-4o.
 */

import { z } from 'zod';

import { loadEnv, resolveProvider } from '../env.js';
import { buildLlmClient, type LlmClient } from '../llm.js';
import type { DestinationGuideSeed } from './destinations-catalog.js';
import {
  ALLOWLIST,
  describeAllowlistForPrompt,
  matchAllowlist,
} from './external-sources-allowlist.js';

// ─── Section ─────────────────────────────────────────────────────────

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
  gastronomy: 'gastronomy',
  gastronomie: 'gastronomy',
  food: 'gastronomy',
  dining: 'gastronomy',
  art_de_vivre: 'art_de_vivre',
  lifestyle: 'art_de_vivre',
  culture: 'art_de_vivre',
  cultural: 'art_de_vivre',
  arts: 'art_de_vivre',
  luxury: 'art_de_vivre',
  palaces: 'palaces',
  hotels: 'palaces',
  shopping: 'shopping',
  fashion: 'shopping',
  retail: 'shopping',
  transports: 'transports',
  transport: 'transports',
  transportation: 'transports',
  access: 'transports',
  practical: 'practical',
  practical_info: 'practical',
  practical_information: 'practical',
  budget: 'practical',
  events: 'events',
  calendar: 'events',
  festivals: 'events',
  conclusion: 'conclusion',
  outro: 'conclusion',
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
        'events',
        'practical',
        'conclusion',
      ])
      .default('art_de_vivre'),
  ),
  title_fr: z.string().min(4).max(180),
  title_en: z.string().min(4).max(180).optional().default(''),
  body_fr: z.string().min(200),
  body_en: z.string().optional().default(''),
});

// ─── Table ───────────────────────────────────────────────────────────

const TABLE_KIND_ALIASES: Readonly<Record<string, string>> = {
  seasons: 'seasons',
  season: 'seasons',
  saisons: 'seasons',
  weather: 'seasons',
  meteo: 'seasons',
  météo: 'seasons',
  palaces_comparison: 'palaces_comparison',
  palaces: 'palaces_comparison',
  hotels: 'palaces_comparison',
  comparison: 'palaces_comparison',
  distances: 'distances',
  distance: 'distances',
  access: 'distances',
  acces: 'distances',
  accès: 'distances',
  transports: 'distances',
  dining_michelin: 'dining_michelin',
  dining: 'dining_michelin',
  michelin: 'dining_michelin',
  restaurants: 'dining_michelin',
  budget: 'budget',
  prices: 'budget',
  cost: 'budget',
  events_calendar: 'events_calendar',
  events: 'events_calendar',
  calendar: 'events_calendar',
  festivals: 'events_calendar',
  shopping: 'shopping',
  boutiques: 'shopping',
  activities: 'activities',
  experiences: 'activities',
  generic: 'generic',
  other: 'generic',
};

const TableHeaderSchema = z.object({
  key: z.string().min(1).max(40),
  label_fr: z.string().min(1).max(80),
  label_en: z.string().min(1).max(80).optional().default(''),
  align: z.enum(['left', 'right', 'center']).optional(),
});

const TableCellSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.object({
    text: z.string(),
    href: z.string().url().optional().nullable(),
  }),
]);

const TableSchema = z.object({
  key: z
    .string()
    .regex(/^[a-z0-9_-]+$/u)
    .min(2)
    .max(60),
  kind: z.preprocess(
    (v) => {
      if (typeof v !== 'string') return v;
      const k = v
        .trim()
        .toLowerCase()
        .replace(/[-\s]+/gu, '_');
      return TABLE_KIND_ALIASES[k] ?? 'generic';
    },
    z
      .enum([
        'seasons',
        'palaces_comparison',
        'distances',
        'dining_michelin',
        'budget',
        'events_calendar',
        'shopping',
        'activities',
        'generic',
      ])
      .default('generic'),
  ),
  title_fr: z.string().min(4).max(140),
  title_en: z.string().min(4).max(140).optional().default(''),
  note_fr: z.string().max(400).optional().default(''),
  note_en: z.string().max(400).optional().default(''),
  headers: z.array(TableHeaderSchema).min(2).max(8),
  // Some specialised tables (e.g. a unique "Palace en vue" callout-card)
  // legitimately carry a single row. Avoid hard-failing the whole pipeline
  // when the LLM produces one row — the front-end renders it fine.
  rows: z.array(z.record(z.string(), TableCellSchema)).min(1).max(20),
});

// ─── Glossary / Callouts / Sources ───────────────────────────────────

const GlossaryEntrySchema = z.object({
  term_fr: z.string().min(2).max(80),
  term_en: z.string().min(2).max(80).optional().default(''),
  definition_fr: z.string().min(40).max(600),
  definition_en: z.string().max(600).optional().default(''),
});

const CalloutSchema = z.object({
  kind: z.preprocess(
    (v) => {
      if (typeof v !== 'string') return v;
      const k = v
        .trim()
        .toLowerCase()
        .replace(/[-\s]+/gu, '_');
      const map: Readonly<Record<string, string>> = {
        did_you_know: 'did_you_know',
        saviez_vous: 'did_you_know',
        le_saviez_vous: 'did_you_know',
        anecdote: 'did_you_know',
        concierge_tip: 'concierge_tip',
        conseil: 'concierge_tip',
        conseil_concierge: 'concierge_tip',
        tip: 'concierge_tip',
        pro_tip: 'pro_tip',
        warning: 'warning',
        attention: 'warning',
        avertissement: 'warning',
        fact: 'fact',
        info: 'fact',
      };
      return map[k] ?? 'did_you_know';
    },
    z.enum(['did_you_know', 'concierge_tip', 'warning', 'pro_tip', 'fact']).default('did_you_know'),
  ),
  title_fr: z.string().min(2).max(120),
  title_en: z.string().min(2).max(120).optional().default(''),
  body_fr: z.string().min(30).max(700),
  body_en: z.string().max(700).optional().default(''),
});

const ExternalSourceSchema = z.object({
  url: z.string().url(),
  label_fr: z.string().min(2).max(160),
  label_en: z.string().max(160).optional().default(''),
  type: z.preprocess(
    (v) => {
      if (typeof v !== 'string') return v;
      const k = v.trim().toLowerCase();
      const map: Readonly<Record<string, string>> = {
        wikipedia: 'wikipedia',
        wiki: 'wikipedia',
        encyclopedia: 'wikipedia',
        encyclopaedia: 'wikipedia',
        wikidata: 'wikidata',
        wikimedia: 'wikimedia_commons',
        commons: 'wikimedia_commons',
        official: 'official',
        site_officiel: 'official',
        hotel_official: 'official',
        operator: 'official',
        group: 'official',
        unesco: 'unesco',
        whc: 'unesco',
        michelin: 'michelin',
        guide_michelin: 'michelin',
        atout_france: 'atout_france',
        atout: 'atout_france',
        tourist_office: 'tourist_office',
        tourism: 'tourist_office',
        office_tourisme: 'tourist_office',
        gov: 'gov',
        government: 'gov',
        ministry: 'gov',
        ministere: 'gov',
        press: 'press',
        magazine: 'press',
        journal: 'press',
        news: 'press',
        media: 'press',
      };
      return map[k] ?? 'other';
    },
    z
      .enum([
        'wikipedia',
        'official',
        'unesco',
        'michelin',
        'atout_france',
        'tourist_office',
        'wikidata',
        'press',
        'wikimedia_commons',
        'gov',
        'other',
      ])
      .default('other'),
  ),
});

// ─── FAQ ─────────────────────────────────────────────────────────────

const FaqSchema = z
  .object({
    question_fr: z.string().max(260).optional().default(''),
    question_en: z.string().max(260).optional().default(''),
    answer_fr: z.string().max(1400).optional().default(''),
    answer_en: z.string().max(1400).optional().default(''),
    category: z.preprocess(
      (v) => {
        if (typeof v !== 'string') return v;
        const k = v.trim().toLowerCase();
        const map: Readonly<Record<string, string>> = {
          before: 'before',
          avant: 'before',
          during: 'during',
          pendant: 'during',
          after: 'after',
          apres: 'after',
          practical: 'practical',
          pratique: 'practical',
          geo: 'geo',
          gastronomy: 'during',
          transport: 'before',
          budget: 'practical',
          safety: 'during',
          events: 'during',
        };
        return map[k] ?? 'practical';
      },
      z.enum(['before', 'during', 'after', 'practical', 'geo']).default('practical'),
    ),
    /** Optional anchor of the section this FAQ enriches (null = global). */
    section_anchor: z
      .string()
      .regex(/^[a-z0-9_-]+$/u)
      .optional()
      .nullable(),
  })
  .refine((f) => f.question_fr.length > 0 || f.question_en.length > 0);

// ─── Practical info (kept from v1, slightly relaxed) ─────────────────

const PracticalInfoSchema = z.object({
  best_time_fr: z.string().min(20).max(900),
  best_time_en: z.string().max(900).optional().default(''),
  currency: z.string().default('EUR'),
  languages_fr: z.string().default('Français, anglais'),
  languages_en: z.string().default('French, English'),
  airports: z
    .array(
      z.object({
        code: z
          .string()
          .regex(/^[A-Z]{3}$/u)
          .optional()
          .nullable(),
        name: z.string().min(2).max(200),
        distance_fr: z.string().max(260).optional().default(''),
        distance_en: z.string().max(260).optional().default(''),
      }),
    )
    .min(1)
    .max(6),
  train_stations: z
    .array(
      z.object({
        name: z.string().min(2).max(200),
        notes_fr: z.string().max(360).optional().default(''),
        notes_en: z.string().max(360).optional().default(''),
      }),
    )
    .max(6)
    .default([]),
});

// ─── Highlights (kept from v1) ───────────────────────────────────────

const HIGHLIGHT_TYPE_ALIASES: Readonly<Record<string, string>> = {
  monument: 'monument',
  museum: 'museum',
  musée: 'museum',
  musee: 'museum',
  park: 'park',
  parc: 'park',
  beach: 'beach',
  plage: 'beach',
  shopping: 'shopping',
  rue: 'shopping',
  restaurant: 'restaurant',
  experience: 'experience',
  expérience: 'experience',
  viewpoint: 'viewpoint',
  panorama: 'viewpoint',
  church: 'church',
  cathedrale: 'church',
  cathédrale: 'church',
  basilique: 'church',
  landmark: 'landmark',
  district: 'landmark',
  quartier: 'landmark',
  neighbourhood: 'landmark',
  neighborhood: 'landmark',
  place: 'landmark',
  port: 'landmark',
  theatre: 'experience',
  theater: 'experience',
  opera: 'experience',
  opéra: 'experience',
  vineyard: 'experience',
  vignoble: 'experience',
  spa: 'experience',
  golf: 'experience',
  ski: 'experience',
  village: 'landmark',
  cliff: 'viewpoint',
  falaise: 'viewpoint',
};

const HIGHLIGHT_TYPE_SET = new Set<string>([
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
]);

const HighlightSchema = z.object({
  name_fr: z.string().min(2).max(180),
  name_en: z.string().min(2).max(180).optional().default(''),
  type: z.preprocess(
    (v) => {
      if (typeof v !== 'string') return v;
      const k = v
        .trim()
        .toLowerCase()
        .replace(/[-\s]+/gu, '_');
      if (HIGHLIGHT_TYPE_ALIASES[k]) return HIGHLIGHT_TYPE_ALIASES[k];
      if (HIGHLIGHT_TYPE_SET.has(k)) return k;
      return 'landmark';
    },
    z
      .enum([
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
      ])
      .default('landmark'),
  ),
  description_fr: z.string().min(30).max(700),
  description_en: z.string().max(700).optional().default(''),
  url: z.string().url().optional().nullable(),
});

// ─── Top-level v2 schemas (per call) ─────────────────────────────────

// ─── Section plan (titles+types only, Call M) ────────────────────────

const SectionPlanItemSchema = z.object({
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
        'events',
        'practical',
        'conclusion',
      ])
      .default('art_de_vivre'),
  ),
  title_fr: z.string().min(4).max(180),
  title_en: z.string().min(4).max(180).optional().default(''),
  brief_fr: z.string().min(30).max(500),
});

export const CallMSchema = z.object({
  summary_fr: z.string().min(60).max(260),
  summary_en: z.string().min(40).max(260).optional().default(''),
  meta_title_fr: z.string().min(15).max(90),
  meta_title_en: z.string().min(15).max(90).optional().default(''),
  meta_desc_fr: z.string().min(50).max(220),
  meta_desc_en: z.string().min(40).max(240).optional().default(''),
  section_plan: z.array(SectionPlanItemSchema).min(8).max(14),
  practical_info: PracticalInfoSchema,
  highlights: z.array(HighlightSchema).min(7).max(16),
});

// Call S: a single section's body content (one per section).
export const CallSSchema = z.object({
  body_fr: z.string().min(350),
  body_en: z.string().optional().default(''),
});

// Kept for backwards compatibility with anyone who imports CallASchema.
export const CallASchema = z.object({
  summary_fr: z.string().min(60).max(260),
  summary_en: z.string().min(40).max(260).optional().default(''),
  meta_title_fr: z.string().min(15).max(90),
  meta_title_en: z.string().min(15).max(90).optional().default(''),
  meta_desc_fr: z.string().min(50).max(220),
  meta_desc_en: z.string().min(40).max(240).optional().default(''),
  sections: z.array(SectionSchema).min(6).max(14),
  practical_info: PracticalInfoSchema,
  highlights: z.array(HighlightSchema).min(5).max(16),
});

export const CallBSchema = z.object({
  tables: z.array(TableSchema).min(3).max(8),
  glossary: z.array(GlossaryEntrySchema).min(4).max(15),
  editorial_callouts: z.array(CalloutSchema).min(2).max(7),
});

export const CallCSchema = z.object({
  faq: z.array(FaqSchema).min(15).max(60),
  external_sources: z.array(ExternalSourceSchema).min(4).max(20),
});

// Split Call C into two focused calls.
export const CallFaqSchema = z.object({
  faq: z.array(FaqSchema).min(20).max(60),
});

export const CallSourcesSchema = z.object({
  external_sources: z.array(ExternalSourceSchema).min(6).max(20),
});

/**
 * Final shape — merges Call A's "shape" with the v2 enrichments
 * (tables, glossary, callouts, sources) and FAQ. The actual content
 * is built by `generateGuideV2()` from the M + S* + B + FAQ + SOURCES
 * pipeline, not by parsing a single LLM response against this schema.
 */
export const GeneratedGuideV2Schema = CallASchema.merge(CallBSchema)
  .merge(CallFaqSchema)
  .merge(CallSourcesSchema);
export type GeneratedGuideV2 = z.infer<typeof GeneratedGuideV2Schema>;

// ─── Prompts ─────────────────────────────────────────────────────────

const SYSTEM_PROMPT_BASE = `Tu es rédacteur éditorial senior pour ConciergeTravel.fr (conciergerie agréée IATA, Palaces et hôtels 5 étoiles en France). Style "long-read Condé Nast Traveler" : précis, factuel, érudit, intemporel — JAMAIS de superlatifs creux ("incroyable", "magique", "à couper le souffle", "féerique").

Voix : 3e personne neutre, anglais britannique (en-GB) pour les _en, français soutenu (mais accessible) pour les _fr.

Anti-hallucination CRITIQUE :
- Tu DOIS t'appuyer EXCLUSIVEMENT sur les "keywords" fournis + tes connaissances Wikipédia-niveau.
- AUCUNE adresse précise, AUCUN prix, AUCUN nom de chef/sommelier/médecin inventé.
- Si tu doutes d'un fait : OMETS-LE ou utilise un terme générique.
- Dates : préfère un siècle/décennie à une année précise.
- Distances : utilise des approximations ("environ 45 minutes en taxi") plutôt qu'un chiffre exact inventé.
- Pas de marketing direct ("réservez", "ne manquez pas").

Format de sortie : JSON STRICT conforme au schéma. Pas de markdown autour. Pas de commentaire.`;

function commonContextLines(dest: DestinationGuideSeed): string[] {
  const lines: string[] = [];
  lines.push(`Destination : **${dest.nameFr}** (${dest.scope}, ${dest.countryCode})`);
  lines.push(`Ton éditorial : ${dest.toneFr}`);
  lines.push(`Slug URL : ${dest.slug}`);
  lines.push('');
  lines.push('### Faits / keywords vérifiés');
  for (const k of dest.keywordsFr) lines.push(`- ${k}`);
  lines.push('');
  return lines;
}

function buildPromptCallM(dest: DestinationGuideSeed): string {
  const lines = commonContextLines(dest);
  lines.push('### Call M — squelette du guide (meta + plan + highlights + practical_info)');
  lines.push('');
  lines.push(
    'Tu vas planifier un guide long-read de ~4500 mots FR. Cette première étape produit le SQUELETTE :',
  );
  lines.push('- résumé, meta SEO');
  lines.push(
    '- liste de 10-12 sections (titres + types + brief 30-80 mots décrivant ce qui sera écrit dans la section)',
  );
  lines.push("- 10-14 highlights (lieux/points d'intérêt) — description 40-80 mots");
  lines.push('- practical_info');
  lines.push('');
  lines.push(
    'Le contenu LONG-FORM des sections sera produit en aval (un appel par section). Ici, on a juste les brefs.',
  );
  lines.push('');
  lines.push('### MINIMUMS IMPÉRATIFS');
  lines.push('- `section_plan` : **MINIMUM 10 sections** (vise 11-12).');
  lines.push('- `highlights` : **MINIMUM 8 entries**.');
  lines.push('');
  lines.push('### Sections types à inclure (ordre conseillé, on peut adapter)');
  lines.push(
    'intro, history, when_to_visit, what_to_see, gastronomy, art_de_vivre, palaces, shopping, transports, events, practical, conclusion.',
  );
  lines.push('');
  lines.push('### Détails par champ');
  lines.push(
    '- `section_plan[].brief_fr` : 30-80 mots décrivant le contenu prévu (ex: "Histoire de Paris de Lutèce à aujourd\'hui — focus sur le baron Haussmann, le Second Empire et la modernisation du XXe siècle").',
  );
  lines.push(
    '- `section_plan[].key` : kebab-case unique (ex: "histoire-paris", "patrimoine-mondial").',
  );
  lines.push(
    '- `summary_fr` (120-180 chars), `meta_title_fr` (≤ 75 chars), `meta_desc_fr` (130-160 chars).',
  );
  lines.push(
    "- `highlights[].description_fr` 40-80 mots, url Wikipédia FR uniquement si certain (sinon omets l'url).",
  );
  lines.push(
    '- `practical_info` : 2-4 airports avec code IATA, 1-3 train_stations, `best_time_fr` ≥ 60 mots.',
  );
  lines.push('');
  lines.push(
    'Économie de tokens : les versions EN doivent être courtes (1 phrase suffit ou vide).',
  );
  lines.push('');
  lines.push('### Schema JSON STRICT');
  lines.push(
    '{ summary_fr, summary_en, meta_title_fr, meta_title_en, meta_desc_fr, meta_desc_en, section_plan:[{key,type,title_fr,title_en,brief_fr}], highlights:[{name_fr,name_en,type,description_fr,description_en,url?}], practical_info:{best_time_fr,best_time_en,currency,languages_fr,languages_en,airports:[{code?,name,distance_fr,distance_en}],train_stations:[{name,notes_fr,notes_en}]} }',
  );
  lines.push('');
  lines.push(
    'Section type parmi : intro, history, when_to_visit, what_to_see, gastronomy, art_de_vivre, palaces, shopping, transports, events, practical, conclusion.',
  );
  lines.push(
    'Highlight type parmi : monument, museum, park, beach, shopping, restaurant, experience, viewpoint, church, landmark.',
  );
  lines.push('');
  lines.push('Retourne UNIQUEMENT le JSON.');
  return lines.join('\n');
}

/**
 * One call per section — focused, no token competition with other
 * outputs. Asks the LLM to write 400-550 words of body_fr.
 */
function buildPromptCallS(
  dest: DestinationGuideSeed,
  plan: z.infer<typeof SectionPlanItemSchema>,
  allPlan: ReadonlyArray<z.infer<typeof SectionPlanItemSchema>>,
): string {
  const lines = commonContextLines(dest);
  lines.push('### Section à rédiger maintenant');
  lines.push(`- Type : **${plan.type}**`);
  lines.push(`- Titre FR : "${plan.title_fr}"`);
  lines.push(`- Brief : ${plan.brief_fr}`);
  lines.push('');
  lines.push('### Autres sections du guide (pour ÉVITER les répétitions)');
  for (const p of allPlan) {
    if (p.key === plan.key && p.title_fr === plan.title_fr) continue;
    lines.push(`- ${p.type} — "${p.title_fr}" : ${p.brief_fr.slice(0, 90)}…`);
  }
  lines.push('');
  lines.push('### LONGUEUR IMPÉRATIVE');
  lines.push(
    "- `body_fr` : **MINIMUM 400 mots, idéal 480-550 mots**. C'est un long-read magazine, pas un résumé.",
  );
  lines.push(
    '- `body_en` : OPTIONNEL — 1 phrase courte (10-30 mots) ou laisse vide "" pour économiser des tokens.',
  );
  lines.push('');
  lines.push('### Style');
  lines.push('- 3-5 paragraphes de 80-120 mots chacun.');
  lines.push('- Voix Condé Nast Traveler : érudite, précise, factuelle, intemporelle.');
  lines.push('- AUCUN superlatif creux. AUCUN nom propre inventé (chefs, médecins, sommeliers).');
  lines.push('- Cite 2-4 faits vérifiables tirés des keywords ci-dessus.');
  lines.push(
    '- Reste DANS le périmètre de cette section ; pas de doublon avec les autres sections listées.',
  );
  lines.push('');
  lines.push('### Schema JSON STRICT');
  lines.push('{ "body_fr": "<400-550 mots>", "body_en": "<phrase courte ou vide>" }');
  lines.push('');
  lines.push('Retourne UNIQUEMENT le JSON.');
  return lines.join('\n');
}

function buildPromptCallB(dest: DestinationGuideSeed, sectionsSummary: string): string {
  const lines = commonContextLines(dest);
  lines.push('### Sections déjà rédigées (Call A) — pour cohérence');
  lines.push(sectionsSummary);
  lines.push('');
  lines.push('### MINIMUMS IMPÉRATIFS (Call B)');
  lines.push('- `tables` : **MINIMUM 4 tableaux** (vise 6).');
  lines.push('- `glossary` : **MINIMUM 6 termes** (vise 10).');
  lines.push('- `editorial_callouts` : **MINIMUM 3 encadrés** (vise 4).');
  lines.push('');
  lines.push('### Contraintes Call B — tableaux + glossaire + encadrés');
  lines.push('');
  lines.push(
    '1. **6 tableaux structurés** (`tables`), kind parmi : seasons, palaces_comparison, distances, dining_michelin, budget, events_calendar.',
  );
  lines.push(
    '   - `seasons` : 4-6 rows = saisons/mois ; headers ex: { saison, mois, climat, affluence, conseil }.',
  );
  lines.push(
    '   - `palaces_comparison` : 3-8 Palaces de la destination ; headers ex: { nom, statut, ambiance, points_forts, budget_indicatif }.',
  );
  lines.push(
    '   - `distances` : 3-6 origines (aéroports, gares) ; headers ex: { origine, distance, temps_voiture, temps_train, transfert_privatif }.',
  );
  lines.push(
    '   - `dining_michelin` : 4-10 tables ; headers ex: { restaurant, etoiles, chef, type_cuisine, budget_indicatif }.',
  );
  lines.push(
    '   - `budget` : 4-6 postes ; headers ex: { poste, gamme_standard, gamme_premium, conseil }.',
  );
  lines.push(
    '   - `events_calendar` : 4-8 événements ; headers ex: { evenement, periode, public, reservation }.',
  );
  lines.push('');
  lines.push(
    '   - `headers` : 3-6 colonnes, chacune { key (kebab-case), label_fr, label_en, align? }.',
  );
  lines.push(
    '   - `rows` : 3-12 lignes par tableau, chaque ligne = objet avec UNE valeur par header.key. Valeur = string OU { text, href } pour lien.',
  );
  lines.push(
    '   - `note_fr` : disclaimer / source (ex: "Source : guide Michelin 2025", "Estimations à titre indicatif").',
  );
  lines.push(
    '   - PAS de prix précis inventés. Pour le budget : utilise des fourchettes ("à partir de 1500€/nuit", "1000-2500€").',
  );
  lines.push('');
  lines.push(
    '2. **8-12 glossary** (`glossary`), termes spécifiques au domaine luxe + destination.',
  );
  lines.push(
    '   - Exemples : "Palace (distinction Atout France)", "Ski-in / Ski-out", "Étoile MICHELIN", "Suite Présidentielle", "Concierge Clefs d\'Or", "RevPAR", "Yachting", "Œnotourisme".',
  );
  lines.push('   - `definition_fr` : 30-80 mots, précise et utile (pas Wikipédia, ton éditorial).');
  lines.push('');
  lines.push(
    '3. **3-5 editorial_callouts** (encadrés), kind parmi : did_you_know, concierge_tip, warning, pro_tip, fact.',
  );
  lines.push(
    '   - `did_you_know` : anecdote historique ou fait insolite (ex: "Saviez-vous que Hemingway séjournait au Ritz dans la suite n°…").',
  );
  lines.push(
    '   - `concierge_tip` : conseil pratique ConciergeTravel (ex: "Notre conseil : réserver 3-6 mois avant pour la haute saison").',
  );
  lines.push('   - `pro_tip` : astuce voyageurs experts.');
  lines.push(
    '   - `warning` : avertissement utile (ex: "Attention : le port de Saint-Tropez est saturé en juillet-août").',
  );
  lines.push('   - `body_fr` 50-150 mots.');
  lines.push('');
  lines.push('### Schema JSON');
  lines.push(
    '{ tables:[{key,kind,title_fr,title_en,note_fr,note_en,headers:[{key,label_fr,label_en,align?}],rows:[{...}]}], glossary:[{term_fr,term_en,definition_fr,definition_en}], editorial_callouts:[{kind,title_fr,title_en,body_fr,body_en}] }',
  );
  lines.push('');
  lines.push('Retourne UNIQUEMENT le JSON.');
  return lines.join('\n');
}

function buildPromptCallFaq(dest: DestinationGuideSeed, sectionsAnchors: string[]): string {
  const lines = commonContextLines(dest);
  lines.push('### Section anchors (utilise-les pour `section_anchor` dans les FAQ contextuelles)');
  lines.push(sectionsAnchors.join(', '));
  lines.push('');
  lines.push('### Call FAQ — 25-40 questions');
  lines.push('');
  lines.push('### MINIMUM IMPÉRATIF : 25 entrées FAQ. Tu DOIS atteindre 25.');
  lines.push('');
  lines.push('**FAQ globales (15)** — `section_anchor: null`. Couvre EXHAUSTIVEMENT :');
  lines.push('- meilleur moment pour visiter');
  lines.push("- comment s'y rendre (aéroports, train)");
  lines.push('- où loger (recommandation Palaces)');
  lines.push('- budget moyen / premium');
  lines.push('- sécurité');
  lines.push('- langues parlées');
  lines.push('- gastronomie locale');
  lines.push('- événements / saison culturelle');
  lines.push('- voyage en famille / enfants');
  lines.push('- accessibilité PMR');
  lines.push('- climat');
  lines.push('- paiement / cartes');
  lines.push('- pourboires');
  lines.push('- internet / connectivité');
  lines.push('- visa / formalités (si applicable)');
  lines.push('');
  lines.push(
    '**FAQ contextuelles (10-15)** — `section_anchor: "<key>"`. 1-2 par anchor, ancrées dans la section.',
  );
  lines.push('');
  lines.push('### Style des réponses');
  lines.push('- `answer_fr` : 40-100 mots, factuelle, utile.');
  lines.push('- `answer_en` : 1 phrase courte (10-25 mots) OU vide "".');
  lines.push('- `category` parmi : before, during, after, practical, geo.');
  lines.push('');
  lines.push('### Schema JSON STRICT');
  lines.push('{ faq:[{question_fr,question_en,answer_fr,answer_en,category,section_anchor}] }');
  lines.push('');
  lines.push('Retourne UNIQUEMENT le JSON.');
  return lines.join('\n');
}

function buildPromptCallSources(dest: DestinationGuideSeed): string {
  const lines = commonContextLines(dest);
  lines.push('### Call Sources — 8-15 sources externes (EEAT signal)');
  lines.push('');
  lines.push('### Allowlist STRICTE (URLs autorisées uniquement)');
  lines.push(describeAllowlistForPrompt());
  lines.push('');
  lines.push(
    "**Règle d'or** : si tu n'es pas CERTAIN à 100 % qu'une URL existe précisément, OMETS-LA.",
  );
  lines.push(
    'Mieux vaut 6 sources sûres que 15 sources hallucinées. Les URLs invalides seront rejetées.',
  );
  lines.push('');
  lines.push(
    "Si tu doutes du chemin exact d'un article, utilise seulement l'URL racine si tu es sûr du slug (ex: `https://fr.wikipedia.org/wiki/Paris`).",
  );
  lines.push('');
  lines.push('### Sources prioritaires à viser');
  lines.push(`- Wikipédia FR pour ${dest.nameFr}`);
  lines.push('- Atout France (si palace distinction)');
  lines.push('- UNESCO (si patrimoine inscrit)');
  lines.push('- Guide MICHELIN (gastronomie)');
  lines.push('- Office du tourisme officiel de la destination');
  lines.push("- Site officiel d'un ou plusieurs Palaces de la destination");
  lines.push('- Wikidata du concept principal');
  lines.push('');
  lines.push('### Champ par entrée');
  lines.push("- `url` : DOIT être sur un domaine de l'allowlist.");
  lines.push(
    '- `type` parmi : wikipedia | wikidata | official | unesco | michelin | atout_france | tourist_office | press | wikimedia_commons | gov | other.',
  );
  lines.push(
    '- `label_fr` : nom clair (ex: "Office du Tourisme de Paris", "Wikipédia — Paris", "UNESCO — Quais de la Seine").',
  );
  lines.push('- `label_en` : 1 traduction courte ou vide.');
  lines.push('');
  lines.push('### Schema JSON STRICT');
  lines.push('{ external_sources:[{url,label_fr,label_en,type}] }');
  lines.push('');
  lines.push('Retourne UNIQUEMENT le JSON.');
  return lines.join('\n');
}

// ─── Helpers to chain LLM calls ──────────────────────────────────────

async function callLlm<S extends z.ZodTypeAny>(
  client: LlmClient,
  systemPrompt: string,
  userPrompt: string,
  schema: S,
  label: string,
): Promise<z.infer<S>> {
  const result = await client.call({
    systemPrompt,
    userPrompt,
    temperature: 0.55,
    maxOutputTokens: 16000,
    responseFormat: 'json',
  });
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.content);
  } catch (err) {
    throw new Error(
      `[${label}] non-JSON output: ${(err as Error).message}. First 300 chars: ${result.content.slice(0, 300)}`,
    );
  }
  const validation = schema.safeParse(parsed);
  if (!validation.success) {
    const issues = validation.error.issues
      .map((i) => `- ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`[${label}] schema-fail:\n${issues}`);
  }
  return validation.data as z.infer<S>;
}

function sectionsAsSummary(sections: ReadonlyArray<z.infer<typeof SectionSchema>>): string {
  return sections
    .map((s, i) => {
      const anchor = (s.key ?? '').length > 0 ? (s.key ?? '') : s.type;
      return `  ${i + 1}. anchor="${anchor}" type=${s.type} title_fr="${s.title_fr}"`;
    })
    .join('\n');
}

function postValidateSources(
  sources: ReadonlyArray<z.infer<typeof ExternalSourceSchema>>,
): z.infer<typeof ExternalSourceSchema>[] {
  const out: z.infer<typeof ExternalSourceSchema>[] = [];
  const seen = new Set<string>();
  for (const s of sources) {
    const allow = matchAllowlist(s.url);
    if (allow === null) continue;
    if (seen.has(s.url)) continue;
    seen.add(s.url);
    out.push({ ...s, type: allow.type });
  }
  return out;
}

// ─── Public entry point ──────────────────────────────────────────────

/**
 * Runs an array of async tasks with a cap on concurrency. Used to
 * parallelize the per-section calls without exceeding the LLM
 * provider's rate limit (typically 10-30 RPM on tier-1 OpenAI).
 */
async function runWithConcurrency<T, R>(
  items: ReadonlyArray<T>,
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers: Promise<void>[] = [];
  const total = items.length;
  const worker = async (): Promise<void> => {
    while (cursor < total) {
      const i = cursor;
      cursor += 1;
      out[i] = await fn(items[i] as T, i);
    }
  };
  const n = Math.min(limit, total);
  for (let w = 0; w < n; w += 1) workers.push(worker());
  await Promise.all(workers);
  return out;
}

export async function generateGuideV2(dest: DestinationGuideSeed): Promise<GeneratedGuideV2> {
  const env = loadEnv();
  const provider = resolveProvider(env);
  const client = buildLlmClient(env, provider);

  // --- Call M ── skeleton: meta + section plan + practical + highlights.
  const callM = await callLlm(
    client,
    SYSTEM_PROMPT_BASE,
    buildPromptCallM(dest),
    CallMSchema,
    `v2 ${dest.slug} call-M`,
  );

  // Normalize section keys (ensure unique anchors).
  const seenKeys = new Set<string>();
  const plan = callM.section_plan.map((p) => {
    let k = (p.key ?? '').length > 0 ? (p.key as string) : p.type;
    let suffix = 1;
    while (seenKeys.has(k)) {
      suffix += 1;
      k = `${(p.key ?? '').length > 0 ? p.key : p.type}-${suffix}`;
    }
    seenKeys.add(k);
    return { ...p, key: k };
  });

  // --- Calls S₁..Sₙ ── one focused call per section, parallelized
  //     with a concurrency cap so we don't blast OpenAI rate limits.
  const sectionBodies = await runWithConcurrency(plan, 4, async (p) => {
    return await callLlm(
      client,
      SYSTEM_PROMPT_BASE,
      buildPromptCallS(dest, p, plan),
      CallSSchema,
      `v2 ${dest.slug} S/${p.key}`,
    );
  });

  const sections: z.infer<typeof SectionSchema>[] = plan.map((p, i) => {
    const body = sectionBodies[i]!;
    return {
      key: p.key,
      type: p.type,
      title_fr: p.title_fr,
      title_en: p.title_en ?? '',
      body_fr: body.body_fr,
      body_en: body.body_en,
    };
  });

  const sectionsSummary = sectionsAsSummary(sections);
  const sectionAnchors = plan.map((p) => p.key);

  // --- Calls B + Faq + Sources ── parallel, all depend only on plan.
  const [callB, callFaq, callSources] = await Promise.all([
    callLlm(
      client,
      SYSTEM_PROMPT_BASE,
      buildPromptCallB(dest, sectionsSummary),
      CallBSchema,
      `v2 ${dest.slug} call-B`,
    ),
    callLlm(
      client,
      SYSTEM_PROMPT_BASE,
      buildPromptCallFaq(dest, sectionAnchors),
      CallFaqSchema,
      `v2 ${dest.slug} call-FAQ`,
    ),
    callLlm(
      client,
      SYSTEM_PROMPT_BASE,
      buildPromptCallSources(dest),
      CallSourcesSchema,
      `v2 ${dest.slug} call-SOURCES`,
    ),
  ]);

  // Post-validate external_sources against allowlist (drop hallucinations).
  const cleanedSources = postValidateSources(callSources.external_sources);

  return {
    summary_fr: callM.summary_fr,
    summary_en: callM.summary_en,
    meta_title_fr: callM.meta_title_fr,
    meta_title_en: callM.meta_title_en,
    meta_desc_fr: callM.meta_desc_fr,
    meta_desc_en: callM.meta_desc_en,
    sections,
    practical_info: callM.practical_info,
    highlights: callM.highlights,
    tables: callB.tables,
    glossary: callB.glossary,
    editorial_callouts: callB.editorial_callouts,
    faq: callFaq.faq,
    external_sources: cleanedSources,
  };
}

// Allowlist re-export for the push step.
export { ALLOWLIST };
