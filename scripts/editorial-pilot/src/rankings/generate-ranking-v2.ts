/**
 * v2 generator for editorial rankings — produces "long-read" (≥ 3500
 * words FR) Top X listings with comparison tables, glossary, callouts,
 * and external sources.
 *
 * Architecture: same split-into-focused-calls pattern as the guide v2
 * pipeline (cf. generate-guide-v2.ts), because GPT-4o consistently
 * truncates per-section output when a single prompt asks for too many
 * concerns at once.
 *
 * Pipeline:
 *   Call M (meta)        — meta + intro + outro + criteria glossary
 *                          + methodology callout + section_plan
 *                          (additional editorial sections to expand on)
 *   Call E (entries)     — the ranked entries with 100-220 word
 *                          justifications (1 LLM call for all entries
 *                          since order matters and they need shared
 *                          context).
 *   Calls S₁..Sₙ          — extra editorial sections (e.g. "Critères de
 *                          sélection", "Tendances 2026"). Parallelized.
 *   Call B (rich blocks) — comparison table + glossary + callouts.
 *   Call FAQ             — 15-20 FAQ.
 *   Call Sources         — external sources, allowlist-filtered.
 *
 * Anti-hallucination:
 *   - Entries: only hotel_ids from the input eligibility list
 *     (post-filter drops hallucinated IDs).
 *   - External sources: filtered against `ALLOWLIST` post-generation.
 */

import { z } from 'zod';

import { loadEnv, resolveProvider } from '../env.js';
import { buildLlmClient, type LlmClient } from '../llm.js';
import {
  describeAllowlistForPrompt,
  matchAllowlist,
} from '../guides/external-sources-allowlist.js';
import type { HotelCatalogRow } from './load-hotels-catalog.js';
import type { RankingSeed } from './rankings-catalog.js';

// ─── Schemas ─────────────────────────────────────────────────────────

const FaqSchema = z
  .object({
    question_fr: z.string().max(260).optional().default(''),
    question_en: z.string().max(260).optional().default(''),
    answer_fr: z.string().max(1400).optional().default(''),
    answer_en: z.string().max(1400).optional().default(''),
    /** Optional anchor of the section this FAQ enriches (null = global). */
    section_anchor: z
      .string()
      .regex(/^[a-z0-9_-]+$/u)
      .optional()
      .nullable(),
  })
  .refine((f) => f.question_fr.length > 0 || f.question_en.length > 0);

const EntrySchema = z.object({
  rank: z.number().int().min(1).max(50),
  // Loose at the schema level — `postValidateEntries` enforces that
  // the id exists in the eligibility list. The LLM occasionally emits
  // a slug or a malformed uuid; we drop those downstream rather than
  // failing the entire batch.
  hotel_id: z.string().min(1),
  justification_fr: z.string().min(60).max(2000),
  justification_en: z.string().max(2000).optional().default(''),
  badge_fr: z.string().max(80).optional().nullable(),
  badge_en: z.string().max(80).optional().nullable(),
});
export type GeneratedRankingEntryV2 = z.infer<typeof EntrySchema>;

// Table / Glossary / Callout / Source schemas — same shape as guides.
const TableHeaderSchema = z.object({
  key: z.string().min(1).max(40),
  label_fr: z.string().min(1).max(80),
  label_en: z.string().min(1).max(80).optional().default(''),
  // The LLM sometimes emits `null` instead of omitting the field — we
  // coerce both null and unknown strings to `undefined` rather than
  // failing the whole 5-call pipeline (see llm-output-robustness skill).
  align: z.preprocess(
    (v) => {
      if (v === null) return undefined;
      if (typeof v === 'string' && ['left', 'right', 'center'].includes(v)) return v;
      return undefined;
    },
    z.enum(['left', 'right', 'center']).optional(),
  ),
});

const TableCellSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.object({ text: z.string(), href: z.string().url().optional().nullable() }),
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
      const map: Readonly<Record<string, string>> = {
        comparison: 'palaces_comparison',
        ranking: 'palaces_comparison',
        top: 'palaces_comparison',
        scores: 'palaces_comparison',
        criteria: 'palaces_comparison',
        criteres: 'palaces_comparison',
        critères: 'palaces_comparison',
        palaces: 'palaces_comparison',
        hotels: 'palaces_comparison',
        budget: 'budget',
        prices: 'budget',
        awards: 'awards',
        distinctions: 'awards',
        generic: 'generic',
      };
      return map[k] ?? 'palaces_comparison';
    },
    z.enum(['palaces_comparison', 'budget', 'awards', 'generic']).default('palaces_comparison'),
  ),
  title_fr: z.string().min(4).max(140),
  title_en: z.string().min(4).max(140).optional().default(''),
  note_fr: z.string().max(400).optional().default(''),
  note_en: z.string().max(400).optional().default(''),
  headers: z.array(TableHeaderSchema).min(2).max(8),
  // Allow degenerate single-row tables (occasional but valid LLM output)
  // rather than fail the whole pipeline — the front-end renders fine.
  rows: z.array(z.record(z.string(), TableCellSchema)).min(1).max(25),
});

const GlossaryEntrySchema = z.object({
  term_fr: z.string().min(2).max(80),
  term_en: z.string().min(2).max(80).optional().default(''),
  // Lenient at the schema level — we'd rather drop a short entry in
  // `postValidateRichBlocks` than fail the whole 5-call pipeline when a
  // single glossary line clocks at 35 chars. The post-validator filters
  // anything below 40 chars (the editorial floor we display).
  definition_fr: z.string().min(20).max(600),
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
        methodology: 'fact',
        method: 'fact',
        methodologie: 'fact',
        méthodologie: 'fact',
        did_you_know: 'did_you_know',
        anecdote: 'did_you_know',
        concierge_tip: 'concierge_tip',
        conseil: 'concierge_tip',
        tip: 'concierge_tip',
        pro_tip: 'pro_tip',
        warning: 'warning',
        attention: 'warning',
        fact: 'fact',
        info: 'fact',
      };
      return map[k] ?? 'fact';
    },
    z.enum(['did_you_know', 'concierge_tip', 'warning', 'pro_tip', 'fact']).default('fact'),
  ),
  title_fr: z.string().min(2).max(120),
  title_en: z.string().min(2).max(120).optional().default(''),
  body_fr: z.string().min(30).max(700),
  body_en: z.string().max(700).optional().default(''),
});

/**
 * URL preprocess for external sources. The LLM frequently emits URLs
 * without a scheme ("www.atout-france.fr/...", "wikipedia.org/wiki/X")
 * or with a stray trailing punctuation. We normalize aggressively here
 * so the strict downstream `matchAllowlist` post-validator sees a
 * canonical absolute URL.
 *
 * Drops outright malformed strings by falling back to a sentinel URL
 * that the allowlist will reject — keeping the schema-level failure
 * count at zero while preserving the post-validation filter.
 */
const UrlField = z.preprocess((v) => {
  if (typeof v !== 'string') return v;
  let s = v.trim();
  if (s.length === 0) return 'https://invalid.example.com/empty';
  s = s.replace(/[)\]\.,;]+$/u, '');
  if (/^https?:\/\//iu.test(s)) return s;
  if (/^\/\//u.test(s)) return `https:${s}`;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/iu.test(s)) return `https://${s}`;
  return 'https://invalid.example.com/unparseable';
}, z.string().url());

const ExternalSourceSchema = z.object({
  url: UrlField,
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

const SECTION_TYPE_ALIASES: Readonly<Record<string, string>> = {
  criteria: 'criteria',
  critères: 'criteria',
  criteres: 'criteria',
  criterias: 'criteria',
  selection: 'criteria',
  méthodologie: 'criteria',
  methodologie: 'criteria',
  methodology: 'criteria',
  trends: 'trends',
  tendances: 'trends',
  trend: 'trends',
  history: 'history',
  histoire: 'history',
  heritage: 'history',
  patrimoine: 'history',
  context: 'history',
  overview: 'history',
  gastronomy_focus: 'gastronomy_focus',
  gastronomy: 'gastronomy_focus',
  gastronomie: 'gastronomy_focus',
  dining: 'gastronomy_focus',
  food: 'gastronomy_focus',
  spa_focus: 'spa_focus',
  spa: 'spa_focus',
  wellness: 'spa_focus',
  bien_etre: 'spa_focus',
  family_focus: 'family_focus',
  family: 'family_focus',
  famille: 'family_focus',
  kids: 'family_focus',
  romance_focus: 'romance_focus',
  romance: 'romance_focus',
  couple: 'romance_focus',
  romantic: 'romance_focus',
  romantique: 'romance_focus',
  value: 'value',
  budget: 'value',
  price: 'value',
  rapport: 'value',
  closing: 'closing',
  conclusion: 'closing',
  closing_thoughts: 'closing',
  highlight: 'criteria',
  highlights: 'criteria',
  spotlight: 'criteria',
};

const SectionTypeField = z.preprocess(
  (v) => {
    if (typeof v !== 'string') return v;
    const k = v
      .trim()
      .toLowerCase()
      .replace(/[-\s]+/gu, '_');
    return SECTION_TYPE_ALIASES[k] ?? 'criteria';
  },
  z
    .enum([
      'criteria',
      'trends',
      'history',
      'gastronomy_focus',
      'spa_focus',
      'family_focus',
      'romance_focus',
      'value',
      'closing',
    ])
    .default('criteria'),
);

// Editorial section (additional long-form content beside entries).
const EditorialSectionSchema = z.object({
  key: z
    .string()
    .regex(/^[a-z0-9_-]+$/u)
    .min(2)
    .max(60),
  type: SectionTypeField,
  title_fr: z.string().min(4).max(180),
  title_en: z.string().min(4).max(180).optional().default(''),
  body_fr: z.string().min(300),
  body_en: z.string().optional().default(''),
});
export type EditorialSection = z.infer<typeof EditorialSectionSchema>;

// Call M: skeleton + intro/outro + meta + section plan for extra sections.
const SectionPlanItemSchema = z.object({
  key: z.string().regex(/^[a-z0-9_-]+$/u),
  type: SectionTypeField,
  title_fr: z.string().min(4).max(180),
  title_en: z.string().min(4).max(180).optional().default(''),
  brief_fr: z.string().min(30).max(500),
});

// Call M-meta — plan + meta (no body content, fast).
export const CallMMetaSchema = z.object({
  meta_title_fr: z.string().min(15).max(90),
  meta_title_en: z.string().max(90).optional().default(''),
  meta_desc_fr: z.string().min(50).max(220),
  meta_desc_en: z.string().max(240).optional().default(''),
  // Slight headroom over the prompt's 5-6 directive — the LLM
  // occasionally proposes 7 sections when the kind is rich (e.g. Paris).
  section_plan: z.array(SectionPlanItemSchema).min(3).max(8),
});

// Call M-intro — focused intro + outro (no other concerns).
export const CallMIntroSchema = z.object({
  intro_fr: z.string().min(500).max(7000),
  intro_en: z.string().max(7000).optional().default(''),
  outro_fr: z.string().min(150).max(2500),
  outro_en: z.string().max(2500).optional().default(''),
});

// Call E (batch): a slice of ranked entries.
export const CallESchema = z.object({
  entries: z.array(EntrySchema).min(1).max(20),
});

// Keep CallMSchema for backwards reference.
export const CallMSchema = z.object({
  intro_fr: z.string(),
  intro_en: z.string(),
  outro_fr: z.string(),
  outro_en: z.string(),
  meta_title_fr: z.string(),
  meta_title_en: z.string(),
  meta_desc_fr: z.string(),
  meta_desc_en: z.string(),
  section_plan: z.array(SectionPlanItemSchema),
});

// Call S: a single editorial section (parallelized).
export const CallSSchema = z.object({
  body_fr: z.string().min(350),
  body_en: z.string().optional().default(''),
});

// Call B: tables + glossary + callouts.
export const CallBSchema = z.object({
  tables: z.array(TableSchema).min(1).max(5),
  glossary: z.array(GlossaryEntrySchema).min(4).max(15),
  editorial_callouts: z.array(CalloutSchema).min(2).max(6),
});

// Call FAQ — Pass 8 (rankings).
// CDC §2.11 + plan rankings-parity-yonder: 10-15 canonical questions + a
// handful of section-anchored ones. We accept up to 25 in case the LLM
// over-produces, and trim downstream.
export const CallFaqSchema = z.object({
  faq: z.array(FaqSchema).min(10).max(25),
});

// Call Sources.
// Relaxed min from 4 → 2: the post-validator (`postValidateSources`)
// further filters via the allowlist; a strict min at the schema level
// fails the entire pipeline whenever the LLM produces unfixable URLs.
// We log a soft warning at the call-site instead.
export const CallSourcesSchema = z.object({
  external_sources: z.array(ExternalSourceSchema).min(2).max(20),
});

// Call Factual Summary — Pass 9 (rankings).
// CDC §2.3: IA-ready 130-150 chars summary, surfaced under H1 + injected
// into Article.description JSON-LD. We use a soft 110-180 window in the
// schema (lint-soft) since the LLM occasionally drifts a few chars; the
// post-validator clamps to the canonical band.
export const CallFactualSummarySchema = z.object({
  factual_summary_fr: z.string().min(80).max(220),
  factual_summary_en: z.string().max(220).optional().default(''),
});

// Final shape.
export const GeneratedRankingV2Schema = z.object({
  intro_fr: z.string(),
  intro_en: z.string(),
  outro_fr: z.string(),
  outro_en: z.string(),
  meta_title_fr: z.string(),
  meta_title_en: z.string(),
  meta_desc_fr: z.string(),
  meta_desc_en: z.string(),
  /** CDC §2.3 — AEO-ready 130-150 chars summary. Pass 9 output. */
  factual_summary_fr: z.string(),
  factual_summary_en: z.string(),
  entries: z.array(EntrySchema),
  faq: z.array(FaqSchema),
  editorial_sections: z.array(EditorialSectionSchema),
  tables: z.array(TableSchema),
  glossary: z.array(GlossaryEntrySchema),
  editorial_callouts: z.array(CalloutSchema),
  external_sources: z.array(ExternalSourceSchema),
});
export type GeneratedRankingV2 = z.infer<typeof GeneratedRankingV2Schema>;

// ─── Prompts ─────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Tu es un rédacteur éditorial spécialisé dans le luxe hôtelier français pour ConciergeTravel.fr (conciergerie agréée IATA spécialisée dans les Palaces et hôtels 5 étoiles en France).

Tu construis des classements éditoriaux ("Les meilleurs Palaces de X", "Top 10 Palaces avec spa", etc.) au ton "long-read Condé Nast Traveler". Style :
- Précis, factuel, JAMAIS de superlatifs creux
- Anti-hallucination obligatoire : tu N'as le droit de citer QUE les hôtels présents dans la liste fournie (par hotel_id UUID).
- Ton respectueux : tu valorises les classés sans jamais "descendre" les autres
- Justifications éditoriales solides, basées sur des facts vérifiables (Palace Atout France, marque connue, ville, vue, etc.)

Format de sortie : JSON STRICT suivant le schéma fourni. Pas de markdown autour. Pas de commentaire.`;

function eligibilityLines(eligible: ReadonlyArray<HotelCatalogRow>): string {
  return eligible
    .map(
      (h) =>
        `- hotel_id="${h.id}" — "${h.name}" (${h.stars}★${h.is_palace ? ' Palace' : ''}, ${h.city}, ${h.region})`,
    )
    .join('\n');
}

function buildPromptCallMMeta(seed: RankingSeed): string {
  const lines: string[] = [];
  lines.push(`Classement : **${seed.titleFr}** (kind=${seed.kind})`);
  lines.push(`Objectif : ${seed.targetLength} hôtels classés.`);
  lines.push('');
  lines.push('### Thématique / keywords');
  for (const k of seed.keywordsFr) lines.push(`- ${k}`);
  lines.push('');
  lines.push(
    '### Call M-meta — meta SEO + plan de sections éditoriales additionnelles (uniquement)',
  );
  lines.push('');
  lines.push('### MINIMUM IMPÉRATIF');
  lines.push('- `section_plan` : **MINIMUM 4 sections additionnelles** parmi :');
  lines.push('  - `criteria` — critères de sélection détaillés');
  lines.push('  - `trends` — tendances 2025-2026');
  lines.push('  - `history` — histoire ou patrimoine du segment');
  lines.push('  - `gastronomy_focus` — focus gastronomie');
  lines.push('  - `spa_focus` — focus bien-être');
  lines.push('  - `family_focus` — focus familles');
  lines.push('  - `romance_focus` — focus voyage en couple');
  lines.push('  - `value` — rapport prestation / expérience');
  lines.push('  - `closing` — synthèse argumentée');
  lines.push('');
  lines.push(
    'Adapte le plan au sujet : un classement "famille" doit avoir family_focus + value, un "spa" doit avoir spa_focus + trends, etc.',
  );
  lines.push('');
  lines.push('### Champs');
  lines.push('- `section_plan[].key` : kebab-case unique.');
  lines.push('- `section_plan[].brief_fr` : 30-80 mots décrivant le contenu prévu de la section.');
  lines.push('- `meta_title_fr` (≤ 75 chars), `meta_desc_fr` (130-160 chars).');
  lines.push('- Versions EN courtes (1 phrase ou vide).');
  lines.push('');
  lines.push('### Schema JSON STRICT');
  lines.push(
    '{ meta_title_fr, meta_title_en, meta_desc_fr, meta_desc_en, section_plan:[{key,type,title_fr,title_en,brief_fr}] }',
  );
  lines.push('');
  lines.push('Retourne UNIQUEMENT le JSON.');
  return lines.join('\n');
}

function buildPromptCallMIntro(
  seed: RankingSeed,
  eligible: ReadonlyArray<HotelCatalogRow>,
): string {
  const lines: string[] = [];
  lines.push(`Classement : **${seed.titleFr}**`);
  lines.push(`Top ${seed.targetLength} hôtels.`);
  lines.push('');
  lines.push('### Thématique / keywords');
  for (const k of seed.keywordsFr) lines.push(`- ${k}`);
  lines.push('');
  lines.push("### Hôtels que tu peux citer dans l'intro (sans hallucination)");
  lines.push(eligibilityLines(eligible.slice(0, 15)));
  lines.push('');
  lines.push('### Call M-intro — intro long-form + outro UNIQUEMENT');
  lines.push('');
  lines.push('### LONGUEUR IMPÉRATIVE');
  lines.push(
    '- `intro_fr` : **MINIMUM 700 mots, idéal 800-1000 mots**. Cette intro est LE long-read du classement.',
  );
  lines.push('- `outro_fr` : 200-300 mots, conclusion éditoriale forte.');
  lines.push('- `intro_en` et `outro_en` : 1 phrase courte ou vide.');
  lines.push('');
  lines.push("### Contenu de l'intro (6-7 paragraphes de 110-140 mots)");
  lines.push('1. Contexte : pourquoi ce segment / cette destination / cette thématique');
  lines.push("2. Méthodologie : sur quels critères ConciergeTravel s'appuie");
  lines.push('3. Panorama : la diversité des hôtels présentés');
  lines.push('4. Tendances 2025-2026');
  lines.push('5. Art de vivre / philosophie du luxe à la française');
  lines.push('6. Anti-superlatifs : comment lire ce classement (chaque hôtel a son public)');
  lines.push('7. Transition vers le Top (1 paragraphe court)');
  lines.push('');
  lines.push('### Style');
  lines.push('- Voix Condé Nast Traveler — érudite, factuelle, intemporelle.');
  lines.push('- AUCUN nom de chef / sommelier / médecin inventé.');
  lines.push('- AUCUN prix précis. Fourchettes uniquement.');
  lines.push('');
  lines.push('### Schema JSON STRICT');
  lines.push('{ intro_fr, intro_en, outro_fr, outro_en }');
  lines.push('');
  lines.push('Retourne UNIQUEMENT le JSON.');
  return lines.join('\n');
}

function buildPromptCallEBatch(
  seed: RankingSeed,
  eligible: ReadonlyArray<HotelCatalogRow>,
  ranksToProduce: ReadonlyArray<number>,
  prevSelected: ReadonlyArray<{ rank: number; hotel_id: string; name: string }>,
): string {
  const lines: string[] = [];
  lines.push(`Classement : **${seed.titleFr}** (kind=${seed.kind})`);
  lines.push(`Ranks à produire dans CE batch : ${ranksToProduce.join(', ')}`);
  lines.push('');
  lines.push('### Thématique / keywords');
  for (const k of seed.keywordsFr) lines.push(`- ${k}`);
  lines.push('');
  if (prevSelected.length > 0) {
    lines.push('### Hôtels déjà classés (ne PAS reprendre)');
    for (const p of prevSelected) {
      lines.push(`- rank ${p.rank} — hotel_id="${p.hotel_id}" — "${p.name}"`);
    }
    lines.push('');
  }
  lines.push(`### Hôtels éligibles restants (${eligible.length} candidats)`);
  lines.push(eligibilityLines(eligible));
  lines.push('');
  lines.push('### MINIMUMS IMPÉRATIFS (par entrée)');
  lines.push(
    '- **`justification_fr` : MINIMUM 130 mots, idéal 160-200 mots**. Argumentaire éditorial étoffé.',
  );
  lines.push(
    '- `badge_fr` (optionnel, ≤ 60 chars) : ex "Le sacre absolu", "Mention spa", "Coup de cœur famille".',
  );
  lines.push('- `justification_en` : 1 phrase courte (10-25 mots) OU vide.');
  lines.push('');
  lines.push('### Contraintes');
  lines.push(
    `1. Tu DOIS produire ${ranksToProduce.length} entries, une par rank dans : ${ranksToProduce.join(', ')}.`,
  );
  lines.push(
    '2. `rank` correspond exactement à un de la liste ci-dessus, `hotel_id` copié depuis les éligibles.',
  );
  lines.push("3. Si moins d'éligibles que de ranks demandés, produis-en autant que possible.");
  lines.push('');
  lines.push('### Anti-hallucination CRITIQUE');
  lines.push('- AUCUN hotel_id absent de la liste.');
  lines.push('- AUCUN prix précis, AUCUN chef inventé.');
  lines.push("- Si tu doutes d'un fait, reste générique.");
  lines.push('');
  lines.push('### Schema JSON STRICT');
  lines.push('{ entries:[{rank,hotel_id,justification_fr,justification_en,badge_fr,badge_en}] }');
  lines.push('');
  lines.push('Retourne UNIQUEMENT le JSON.');
  return lines.join('\n');
}

function buildPromptCallS(
  seed: RankingSeed,
  plan: z.infer<typeof SectionPlanItemSchema>,
  allPlan: ReadonlyArray<z.infer<typeof SectionPlanItemSchema>>,
): string {
  const lines: string[] = [];
  lines.push(`Classement : **${seed.titleFr}**`);
  lines.push('');
  lines.push('### Section à rédiger maintenant');
  lines.push(`- Type : **${plan.type}**`);
  lines.push(`- Titre FR : "${plan.title_fr}"`);
  lines.push(`- Brief : ${plan.brief_fr}`);
  lines.push('');
  lines.push('### Autres sections du classement (pour éviter les répétitions)');
  for (const p of allPlan) {
    if (p.key === plan.key) continue;
    lines.push(`- ${p.type} — "${p.title_fr}" : ${p.brief_fr.slice(0, 100)}…`);
  }
  lines.push('');
  lines.push('### LONGUEUR IMPÉRATIVE');
  lines.push(
    "- `body_fr` : **MINIMUM 400 mots, idéal 480-550 mots**. C'est un long-read magazine.",
  );
  lines.push('- `body_en` : OPTIONNEL — 1 phrase courte ou vide.');
  lines.push('');
  lines.push('### Style');
  lines.push('- 3-5 paragraphes substantiels.');
  lines.push('- Voix Condé Nast Traveler.');
  lines.push('- Données vérifiables uniquement, AUCUN nom propre inventé.');
  lines.push('');
  lines.push('### Schema JSON STRICT');
  lines.push('{ body_fr, body_en }');
  lines.push('');
  lines.push('Retourne UNIQUEMENT le JSON.');
  return lines.join('\n');
}

function buildPromptCallB(seed: RankingSeed, eligible: ReadonlyArray<HotelCatalogRow>): string {
  const lines: string[] = [];
  lines.push(`Classement : **${seed.titleFr}**`);
  lines.push('');
  lines.push('### Call B — tableau comparatif + glossaire + encadrés');
  lines.push('');
  lines.push('### MINIMUMS IMPÉRATIFS');
  lines.push('- `tables` : **MINIMUM 1 tableau comparatif** Top N (cible 2 : critères + budget).');
  lines.push('- `glossary` : **MINIMUM 5 termes**.');
  lines.push('- `editorial_callouts` : **MINIMUM 2 encadrés**.');
  lines.push('');
  lines.push('1. **Tableaux** :');
  lines.push(
    '   - `kind=palaces_comparison` : Top N × critères (ambiance, points forts, badge, budget indicatif, Atout France).',
  );
  lines.push('   - `kind=budget` (optionnel) : fourchette par niveau de prestation.');
  lines.push('   - Headers 3-5 colonnes, rows = entries du Top.');
  lines.push(
    '   - PAS de prix exacts inventés. Utilise des fourchettes ("à partir de 1500€/nuit", "1200-2500€").',
  );
  lines.push('');
  lines.push('2. **Glossaire** (5-10 termes) — critères et concepts du segment.');
  lines.push(
    '   - Ex : "Palace (distinction Atout France)", "Étoile MICHELIN", "Concierge Clefs d\'Or", "Spa Cinq Mondes / La Mer", "Suite Présidentielle".',
  );
  lines.push('');
  lines.push('3. **Encadrés** (2-4) — méthodologie, anecdote, conseil :');
  lines.push('   - `kind=fact` : méthodologie du classement (50-100 mots).');
  lines.push('   - `kind=concierge_tip` : conseil pratique ConciergeTravel.');
  lines.push('   - `kind=did_you_know` : anecdote sur le segment.');
  lines.push('');
  lines.push(`### Hôtels éligibles (pour info, le Top sera dérivé séparément)`);
  lines.push(eligibilityLines(eligible.slice(0, 15)));
  lines.push('');
  lines.push('### Schema JSON STRICT');
  lines.push(
    '{ tables:[{key,kind,title_fr,title_en,note_fr,note_en,headers:[{key,label_fr,label_en,align?}],rows:[{...}]}], glossary:[{term_fr,term_en,definition_fr,definition_en}], editorial_callouts:[{kind,title_fr,title_en,body_fr,body_en}] }',
  );
  lines.push('');
  lines.push('Retourne UNIQUEMENT le JSON.');
  return lines.join('\n');
}

/**
 * Pass 8 — FAQ canoniques 10-15 Q&A par lieu/theme (CDC §2.11).
 *
 * Strategy: enforce a list of CANONICAL questions that MUST be answered
 * (10 baseline) and let the LLM add up to 5 contextual questions
 * anchored to specific editorial sections. The result is dense,
 * AEO-ready FAQ blocks that LLMs (Perplexity, ChatGPT, Google AI
 * Overviews) can extract verbatim.
 */
function buildPromptCallFaq(seed: RankingSeed, sectionAnchors: ReadonlyArray<string>): string {
  const lines: string[] = [];
  lines.push(`Classement : **${seed.titleFr}** (kind=${seed.kind})`);
  lines.push('');
  lines.push('### Pass 8 — FAQ canoniques 10-15 Q&A (CDC §2.11)');
  lines.push('');
  lines.push('### MINIMUM IMPÉRATIF : exactement 10 à 15 entrées FAQ. Pas plus.');
  lines.push('');
  lines.push('**Bloc CANONIQUE (10 questions OBLIGATOIRES)** — `section_anchor: null`.');
  lines.push(
    'Reformule chaque question pour coller au contexte du classement, mais traite les 10 thèmes ci-dessous SANS EXCEPTION :',
  );
  lines.push('1. Méthodologie : sur quels critères ce classement est-il établi ?');
  lines.push("2. Critères de sélection : qu'est-ce qui distingue les hôtels retenus ?");
  lines.push('3. Différence Palace vs 5 étoiles (ou type vs autre type, selon le sujet)');
  lines.push('4. Meilleur moment pour réserver / saisonnalité');
  lines.push('5. Fourchettes de prix indicatives par nuit (sans prix précis inventé)');
  lines.push("6. Conditions d'annulation et flexibilité");
  lines.push('7. Programme de fidélité / loyalty / avantages réservation directe');
  lines.push('8. Service conciergerie / personnalisation séjour');
  lines.push('9. Accessibilité PMR et adaptation enfants/famille');
  lines.push('10. Comment réserver via ConciergeTravel.fr (avantages vs OTA)');
  lines.push('');
  lines.push(
    '**Bloc CONTEXTUEL (0 à 5 questions)** — `section_anchor` parmi : ' + sectionAnchors.join(', '),
  );
  lines.push(
    'Une question par section éditoriale lorsque la section appelle un éclaircissement spécifique. Optionnel.',
  );
  lines.push('');
  lines.push('### LONGUEUR RÉPONSES (CDC §2.11 — denser que AEO 40-80)');
  lines.push(
    '- `answer_fr` : **50-100 mots**, factuelle, structurée pour citation LLM (commence par la réponse directe).',
  );
  lines.push('- `answer_en` : 1 phrase courte (10-25 mots) OU vide.');
  lines.push("- `question_fr` : naturelle, telle qu'un voyageur la poserait à Google ou ChatGPT.");
  lines.push('');
  lines.push('### Anti-hallucination');
  lines.push('- Aucun prix précis inventé. Fourchettes ("à partir de…", "1500-3500€/nuit").');
  lines.push(
    "- Aucun nom de chef / sommelier / spa-thérapeute spécifique sauf si déjà validé dans l'intro.",
  );
  lines.push(
    '- Si une question ne s\'applique pas au sujet (ex : Palace vs 5★ pour un classement "chalets"), reformule pour rester pertinent (ex : "chalet de luxe vs hôtel de montagne").',
  );
  lines.push('');
  lines.push('### Schema JSON STRICT');
  lines.push('{ faq:[{question_fr,question_en,answer_fr,answer_en,section_anchor}] }');
  lines.push('');
  lines.push('Retourne UNIQUEMENT le JSON.');
  return lines.join('\n');
}

/**
 * Pass 9 — Factual summary 130-150 chars (CDC §2.3, AEO).
 *
 * The summary surfaces under the H1 of the ranking page AND is injected
 * into the `Article.description` JSON-LD. It is the FIRST thing an LLM
 * reads when extracting an answer from this page — keep it dense and
 * claim-ready.
 *
 * Format target (FR):
 *   "Sélection éditoriale de N [type] [adjectif] à/en [lieu], [year] : [3 USP courts séparés par virgule]."
 */
function buildPromptCallFactualSummary(seed: RankingSeed): string {
  const lines: string[] = [];
  lines.push(`Classement : **${seed.titleFr}** (kind=${seed.kind})`);
  lines.push('');
  lines.push('### Pass 9 — Factual summary 130-150 chars (CDC §2.3, AEO)');
  lines.push('');
  lines.push('### Thématique / keywords');
  for (const k of seed.keywordsFr) lines.push(`- ${k}`);
  lines.push('');
  lines.push('### Format STRICT (FR)');
  lines.push(
    '"Sélection éditoriale de N [type] [adjectif] à/en [lieu], [year] : [3 USP courts séparés par virgule]."',
  );
  lines.push('');
  lines.push('### CONTRAINTES');
  lines.push(
    "- `factual_summary_fr` : **130-150 caractères STRICT** (espaces compris). C'est un signal AEO + une description JSON-LD.",
  );
  lines.push(
    '- `factual_summary_en` : version EN, **130-150 caractères STRICT** OU vide si tu doutes.',
  );
  lines.push(
    '- Commence par "Sélection éditoriale de…" ou "Classement éditorial de…" (variant pour ne pas répéter le H1).',
  );
  lines.push(
    '- Termine par 3 USP concrets (ex : "Palace Atout France, étoiles Michelin, art de vivre").',
  );
  lines.push('- AUCUN superlatif creux ("le plus beau", "le meilleur" sans précision).');
  lines.push('- AUCUN prix précis, AUCUN nom propre inventé.');
  lines.push('');
  lines.push('### Schema JSON STRICT');
  lines.push('{ factual_summary_fr, factual_summary_en }');
  lines.push('');
  lines.push('Retourne UNIQUEMENT le JSON.');
  return lines.join('\n');
}

function buildPromptCallSources(seed: RankingSeed): string {
  const lines: string[] = [];
  lines.push(`Classement : **${seed.titleFr}**`);
  lines.push('');
  lines.push('### Call Sources — 4-10 sources externes (EEAT signal)');
  lines.push('');
  lines.push('### Allowlist STRICTE (URLs autorisées uniquement)');
  lines.push(describeAllowlistForPrompt());
  lines.push('');
  lines.push(
    '**Format URL OBLIGATOIRE** : `https://` complet, jamais relatif. Ex : `https://www.atout-france.fr/...`, `https://fr.wikipedia.org/wiki/...`, `https://guide.michelin.com/...`. Les URLs sans schéma (`www.x.com/...`, `wikipedia.org/...`) seront rejetées.',
  );
  lines.push('');
  lines.push(
    "**Règle d'or** : si tu n'es pas CERTAIN à 100 % d'une URL, OMETS-LA. Les URLs hors allowlist seront rejetées. Mieux vaut 4 URLs solides que 10 douteuses.",
  );
  lines.push('');
  lines.push('### Sources prioritaires');
  lines.push('- Atout France (liste Palaces officielle)');
  lines.push('- Guide MICHELIN (étoilés)');
  lines.push('- Wikipedia FR pour les Palaces phares');
  lines.push(
    '- Sites officiels des hôtels (groupes : LVMH, Dorchester, Oetker, Four Seasons, etc.)',
  );
  lines.push('- Presse de référence (Condé Nast Traveler, Forbes, Madame Figaro)');
  lines.push('');
  lines.push('### Schema JSON STRICT');
  lines.push('{ external_sources:[{url,label_fr,label_en,type}] }');
  lines.push('');
  lines.push('Retourne UNIQUEMENT le JSON.');
  return lines.join('\n');
}

// ─── Helpers ─────────────────────────────────────────────────────────

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

/**
 * Pass 8 post-validation. We:
 *   1. Drop FAQ entries with empty question or empty answer (LLM rarely
 *      emits these but the schema permits empty strings on `_en`).
 *   2. Clamp the count to 15 (CDC §2.11 sweet spot is 10-15).
 *   3. Log a warning if any of the 10 canonical themes is uncovered —
 *      a soft signal, doesn't fail the pipeline since the LLM may
 *      legitimately reword a theme out of recognition. The next pass
 *      (Payload editor) catches these manually.
 */
const CANONICAL_FAQ_KEYWORDS: ReadonlyArray<{
  readonly theme: string;
  readonly any: ReadonlyArray<string>;
}> = [
  {
    theme: 'methodologie',
    any: ['méthodologie', 'methodologie', 'critère', 'criteres', 'classement établi', 'sélection'],
  },
  {
    theme: 'criteres-selection',
    any: ['distingue', 'différencie', 'sélection', 'critères', 'retenu'],
  },
  {
    theme: 'palace-vs-5-etoiles',
    any: ['palace', '5 étoiles', '5-étoiles', 'différence', 'distinction'],
  },
  {
    theme: 'saisonnalite',
    any: ['saison', 'meilleur moment', 'quand réserver', 'période', 'haute saison'],
  },
  { theme: 'prix', any: ['prix', 'tarif', 'budget', 'fourchette', 'à partir de'] },
  { theme: 'annulation', any: ['annulation', 'flexibilité', 'remboursement', 'modification'] },
  { theme: 'fidelite', any: ['fidélité', 'loyalty', 'avantages', 'réservation directe', 'membre'] },
  {
    theme: 'conciergerie',
    any: ['conciergerie', 'concierge', 'personnalisation', 'service', 'sur mesure'],
  },
  { theme: 'accessibilite', any: ['pmr', 'accessibilité', 'enfants', 'famille', 'handicap'] },
  {
    theme: 'comment-reserver',
    any: ['conciergetravel', 'comment réserver', 'réserver via', 'avantage vs', 'sans frais'],
  },
];

function postValidateFaq(
  faq: ReadonlyArray<z.infer<typeof FaqSchema>>,
  slug: string,
): z.infer<typeof FaqSchema>[] {
  const cleaned = faq.filter(
    (f) => f.question_fr.trim().length > 0 && f.answer_fr.trim().length > 0,
  );
  const clamped = cleaned.slice(0, 15);
  if (clamped.length < 10) {
    console.warn(
      `  ⚠ [${slug}] FAQ pass 8: only ${clamped.length} valid entries (target 10-15). Editor follow-up needed.`,
    );
  }
  const haystack = clamped
    .map((f) => `${f.question_fr} ${f.answer_fr}`.toLowerCase())
    .join(' \u0001 ');
  const missing: string[] = [];
  for (const c of CANONICAL_FAQ_KEYWORDS) {
    const covered = c.any.some((k) => haystack.includes(k.toLowerCase()));
    if (!covered) missing.push(c.theme);
  }
  if (missing.length > 0) {
    console.warn(
      `  ⚠ [${slug}] FAQ pass 8: canonical themes uncovered (${missing.length}/10): ${missing.join(', ')}`,
    );
  }
  return clamped;
}

/**
 * Drops glossary entries with sub-editorial-floor (< 40 chars) FR
 * definitions. Mirrors the schema-level lenience added to
 * `GlossaryEntrySchema`: the LLM occasionally returns a 30-character
 * definition, which we'd rather drop here than fail the whole
 * 5-call pipeline. Logs a soft warning so we keep an audit trail.
 */
function postValidateRichBlocks(
  callB: z.infer<typeof CallBSchema>,
  slug: string,
): z.infer<typeof CallBSchema> {
  const FLOOR = 40;
  const filtered = callB.glossary.filter((g) => g.definition_fr.trim().length >= FLOOR);
  const dropped = callB.glossary.length - filtered.length;
  if (dropped > 0) {
    console.warn(
      `  ⚠ [${slug}] dropped ${dropped} glossary entr${dropped === 1 ? 'y' : 'ies'} below ${FLOOR}-char floor.`,
    );
  }
  return { ...callB, glossary: filtered };
}

/**
 * Pass 9 post-validation. The CDC §2.3 band is 130-150 chars; we accept
 * 110-180 here (LLMs drift by a handful of chars) and log soft warnings.
 * EN is optional (V1 is FR-only).
 */
function postValidateFactualSummary(
  summary: { factual_summary_fr: string; factual_summary_en: string },
  slug: string,
): { factual_summary_fr: string; factual_summary_en: string } {
  const fr = summary.factual_summary_fr.trim();
  const en = summary.factual_summary_en.trim();
  if (fr.length < 110 || fr.length > 180) {
    console.warn(`  ⚠ [${slug}] factual_summary_fr pass 9: ${fr.length} chars (target 130-150).`);
  }
  if (en.length > 0 && (en.length < 110 || en.length > 180)) {
    console.warn(`  ⚠ [${slug}] factual_summary_en pass 9: ${en.length} chars (target 130-150).`);
  }
  return { factual_summary_fr: fr, factual_summary_en: en };
}

function postValidateEntries(
  entries: ReadonlyArray<z.infer<typeof EntrySchema>>,
  eligible: ReadonlyArray<HotelCatalogRow>,
): z.infer<typeof EntrySchema>[] {
  const known = new Set(eligible.map((h) => h.id));
  const seenIds = new Set<string>();
  const seenRanks = new Set<number>();
  const out: z.infer<typeof EntrySchema>[] = [];
  for (const e of entries) {
    if (!known.has(e.hotel_id)) {
      console.warn(`  ⚠ dropping hallucinated hotel_id ${e.hotel_id} (rank ${e.rank})`);
      continue;
    }
    if (seenIds.has(e.hotel_id)) continue;
    if (seenRanks.has(e.rank)) continue;
    seenIds.add(e.hotel_id);
    seenRanks.add(e.rank);
    out.push(e);
  }
  out.sort((a, b) => a.rank - b.rank);
  return out.map((e, idx) => ({ ...e, rank: idx + 1 }));
}

// ─── Public entry point ──────────────────────────────────────────────

/**
 * Generate the ranked entries in batches of `BATCH_SIZE`. We
 * generate sequentially batch-by-batch (not in parallel) so each
 * subsequent call sees the previously-selected hotels and avoids
 * duplicates. Within a batch, the LLM produces several entries with
 * shared context — the right granularity to keep justifications
 * substantive (160-200 words each) without over-loading the prompt.
 */
const ENTRIES_BATCH_SIZE = 4;

async function generateEntries(
  client: LlmClient,
  seed: RankingSeed,
  eligible: ReadonlyArray<HotelCatalogRow>,
): Promise<GeneratedRankingEntryV2[]> {
  const N = Math.min(seed.targetLength, eligible.length);
  const collected: GeneratedRankingEntryV2[] = [];
  const remaining = new Map<string, HotelCatalogRow>();
  for (const h of eligible) remaining.set(h.id, h);

  for (let start = 1; start <= N; start += ENTRIES_BATCH_SIZE) {
    const end = Math.min(start + ENTRIES_BATCH_SIZE - 1, N);
    const ranks: number[] = [];
    for (let r = start; r <= end; r += 1) ranks.push(r);
    const prevSelected = collected.map((e) => {
      const h = eligible.find((x) => x.id === e.hotel_id);
      return { rank: e.rank, hotel_id: e.hotel_id, name: h?.name ?? '?' };
    });
    const eligibleNow = Array.from(remaining.values());
    const batch = await callLlm(
      client,
      SYSTEM_PROMPT,
      buildPromptCallEBatch(seed, eligibleNow, ranks, prevSelected),
      CallESchema,
      `v2 ${seed.slug} E batch ${start}-${end}`,
    );
    for (const e of batch.entries) {
      if (!remaining.has(e.hotel_id)) {
        console.warn(`  ⚠ dropping hallucinated hotel_id ${e.hotel_id} (rank ${e.rank})`);
        continue;
      }
      collected.push(e);
      remaining.delete(e.hotel_id);
    }
  }
  return collected;
}

export async function generateRankingV2(
  seed: RankingSeed,
  eligible: ReadonlyArray<HotelCatalogRow>,
): Promise<GeneratedRankingV2> {
  if (eligible.length < 3) {
    throw new Error(
      `Not enough eligible hotels for ranking "${seed.slug}" (got ${eligible.length}, need ≥ 3).`,
    );
  }
  const env = loadEnv();
  const provider = resolveProvider(env);
  const client = buildLlmClient(env, provider);

  // Phase 1 — meta plan + focused intro/outro, in parallel.
  const [callMMeta, callMIntro] = await Promise.all([
    callLlm(
      client,
      SYSTEM_PROMPT,
      buildPromptCallMMeta(seed),
      CallMMetaSchema,
      `v2 ${seed.slug} call-M-meta`,
    ),
    callLlm(
      client,
      SYSTEM_PROMPT,
      buildPromptCallMIntro(seed, eligible),
      CallMIntroSchema,
      `v2 ${seed.slug} call-M-intro`,
    ),
  ]);

  // Normalize section plan keys (unique anchors).
  const seenKeys = new Set<string>();
  const plan = callMMeta.section_plan.map((p) => {
    let k = p.key;
    let suffix = 1;
    while (seenKeys.has(k)) {
      suffix += 1;
      k = `${p.key}-${suffix}`;
    }
    seenKeys.add(k);
    return { ...p, key: k };
  });

  // Phase 2 — entries (sequential batches) + sections + B + FAQ (Pass 8)
  // + factual_summary (Pass 9) + sources, in parallel.
  const sectionAnchors = plan.map((p) => p.key);

  const [entriesRaw, sectionBodies, callB, callFaq, callFactualSummary, callSources] =
    await Promise.all([
      generateEntries(client, seed, eligible),
      runWithConcurrency(plan, 3, (p) =>
        callLlm(
          client,
          SYSTEM_PROMPT,
          buildPromptCallS(seed, p, plan),
          CallSSchema,
          `v2 ${seed.slug} S/${p.key}`,
        ),
      ),
      callLlm(
        client,
        SYSTEM_PROMPT,
        buildPromptCallB(seed, eligible),
        CallBSchema,
        `v2 ${seed.slug} call-B`,
      ),
      callLlm(
        client,
        SYSTEM_PROMPT,
        buildPromptCallFaq(seed, sectionAnchors),
        CallFaqSchema,
        `v2 ${seed.slug} call-FAQ (pass 8)`,
      ),
      callLlm(
        client,
        SYSTEM_PROMPT,
        buildPromptCallFactualSummary(seed),
        CallFactualSummarySchema,
        `v2 ${seed.slug} call-FACTUAL_SUMMARY (pass 9)`,
      ),
      callLlm(
        client,
        SYSTEM_PROMPT,
        buildPromptCallSources(seed),
        CallSourcesSchema,
        `v2 ${seed.slug} call-SOURCES`,
      ),
    ]);

  const editorialSections: EditorialSection[] = plan.map((p, i) => {
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

  const cleanedEntries = postValidateEntries(entriesRaw, eligible);
  if (cleanedEntries.length < 3) {
    throw new Error(`Only ${cleanedEntries.length} valid entries after dedupe.`);
  }
  const cleanedSources = postValidateSources(callSources.external_sources);
  if (cleanedSources.length < 3) {
    console.warn(
      `  ⚠ [${seed.slug}] only ${cleanedSources.length} valid external sources after allowlist filter (target ≥ 4).`,
    );
  }

  // Pass 8 post-validation: clamp 10-15, log canonical-coverage gaps.
  const cleanedFaq = postValidateFaq(callFaq.faq, seed.slug);

  // Pass 9 post-validation: log if outside 130-150 char band but don't fail.
  const factualSummary = postValidateFactualSummary(callFactualSummary, seed.slug);

  // Drop sub-floor glossary entries to keep render quality high.
  const cleanedB = postValidateRichBlocks(callB, seed.slug);

  return {
    intro_fr: callMIntro.intro_fr,
    intro_en: callMIntro.intro_en,
    outro_fr: callMIntro.outro_fr,
    outro_en: callMIntro.outro_en,
    meta_title_fr: callMMeta.meta_title_fr,
    meta_title_en: callMMeta.meta_title_en,
    meta_desc_fr: callMMeta.meta_desc_fr,
    meta_desc_en: callMMeta.meta_desc_en,
    factual_summary_fr: factualSummary.factual_summary_fr,
    factual_summary_en: factualSummary.factual_summary_en,
    entries: cleanedEntries,
    faq: cleanedFaq,
    editorial_sections: editorialSections,
    tables: cleanedB.tables,
    glossary: cleanedB.glossary,
    editorial_callouts: cleanedB.editorial_callouts,
    external_sources: cleanedSources,
  };
}
