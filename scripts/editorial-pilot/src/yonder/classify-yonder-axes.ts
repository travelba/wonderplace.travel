/**
 * classify-yonder-axes.ts — tag every yonder Top with our canonical
 * `RankingAxes` (type / lieu / theme / occasion / saison) so the
 * matrice combinator can detect overlaps with our auto-generated
 * seeds and surface yonder-specific Tops as overrides.
 *
 * Pipeline:
 *   1. Read `data/yonder-tops-fr-index.json` (output of WS0bis).
 *   2. Skip entries already classified in
 *      `data/yonder-tops-fr-classified.json` (idempotent re-runs).
 *   3. Batch the remaining entries into groups of `BATCH_SIZE` and
 *      ask the LLM to emit a strict JSON array of axes — one entry
 *      per input title.
 *   4. Validate against `YonderAxesPayloadSchema`, drop any entry
 *      whose lieu cannot be resolved via `resolveLieu(...)`.
 *   5. Persist incrementally after each batch — interrupting and
 *      resuming is safe.
 *
 * Cost: ~36 batches * ~1500 input tokens ~ 54k input + ~36 * 800
 * output ~= ~85k tokens with gpt-4o-mini ≈ $0.04.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

import { loadEnv, resolveProvider } from '../env.js';
import { buildLlmClient } from '../llm.js';
import {
  HotelTypeSchema,
  LieuScopeSchema,
  OccasionSchema,
  RankingAxesSchema,
  SaisonSchema,
  ThemeSchema,
  resolveLieu,
  type RankingAxes,
} from '../rankings/axes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUT_DIR = resolve(__dirname, '../../data');
const IN_PATH = resolve(OUT_DIR, 'yonder-tops-fr-index.json');
const OUT_PATH = resolve(OUT_DIR, 'yonder-tops-fr-classified.json');

const BATCH_SIZE = 10;
const NO_CACHE = process.argv.includes('--no-cache');

// ─── Types ────────────────────────────────────────────────────────────────

interface YonderTopMin {
  readonly slug: string;
  readonly title: string;
  readonly excerpt: string | null;
}

export interface ClassifiedYonderTop {
  readonly slug: string;
  readonly title: string;
  readonly excerpt: string | null;
  readonly axes: RankingAxes;
  /** Free-form lieu emitted by the LLM, kept for audit trail. */
  readonly llmLieuRaw: string;
  /** True when `resolveLieu(...)` matched a canonical lieu. */
  readonly lieuResolved: boolean;
}

interface ClassifiedFile {
  readonly classifiedAt: string;
  readonly total: number;
  readonly resolved: number;
  readonly unresolved: number;
  readonly entries: readonly ClassifiedYonderTop[];
}

// ─── LLM payload schema ───────────────────────────────────────────────────

/**
 * LLM drift aliases — the model frequently emits adjacent vocabulary
 * (`montagne` for scope, `charme` for theme, `été` accented). Per
 * `.cursor/skills/llm-output-robustness/SKILL.md` rule 5 we coerce
 * before validation; unknown values fall back to a sentinel so the
 * post-validation step can drop the entry without crashing the batch.
 */
const SCOPE_ALIASES: Readonly<Record<string, string>> = {
  montagne: 'cluster',
  station: 'station',
  ski: 'station',
  quartier: 'arrondissement',
  arrondissements: 'arrondissement',
  pays: 'france',
  national: 'france',
  region: 'region',
};

const THEME_ALIASES: Readonly<Record<string, string>> = {
  charme: 'patrimoine',
  luxe: 'patrimoine',
  prestige: 'patrimoine',
  spa: 'spa-bienetre',
  bienetre: 'spa-bienetre',
  'bien-etre': 'spa-bienetre',
  wellness: 'spa-bienetre',
  thalasso: 'spa-bienetre',
  oenotourisme: 'vignobles',
  vin: 'vignobles',
  vins: 'vignobles',
  vignoble: 'vignobles',
  golf: 'sport-golf',
  tennis: 'sport-tennis',
  padel: 'sport-padel',
  surf: 'sport-surf',
  ski: 'sport-ski',
  yoga: 'spa-bienetre',
  amoureux: 'romantique',
  couple: 'romantique',
  famille: 'famille',
  enfants: 'famille',
  kidsfriendly: 'kids-friendly',
  art: 'design',
  contemporain: 'design',
  historique: 'patrimoine',
  monument: 'patrimoine',
  mer: 'mer',
  bord: 'mer',
  plage: 'mer',
  ocean: 'mer',
  campagne: 'campagne',
  vert: 'campagne',
  jardin: 'campagne',
  ville: 'urbain',
  rooftop: 'rooftop',
  piscine: 'piscine',
  insolite: 'insolite',
};

const OCCASION_ALIASES: Readonly<Record<string, string>> = {
  weekend: 'week-end',
  honeymoon: 'lune-de-miel',
  honeymooners: 'lune-de-miel',
  business: 'seminaire',
  meeting: 'seminaire',
  noel: 'fetes',
  saintvalentin: 'anniversaire',
  fetesh: 'fetes',
  feteh: 'fetes',
  reveillon: 'fetes',
  detox: 'minceur',
  wellness: 'minceur',
};

const SAISON_ALIASES: Readonly<Record<string, string>> = {
  ete: 'ete',
  été: 'ete',
  summer: 'ete',
  hiver: 'hiver',
  winter: 'hiver',
  printemps: 'printemps',
  spring: 'printemps',
  automne: 'automne',
  autumn: 'automne',
  fall: 'automne',
  '': 'toute-annee',
  none: 'toute-annee',
  any: 'toute-annee',
};

function normalizeKey(s: unknown): string {
  if (typeof s !== 'string') return '';
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/[^a-z0-9-]+/gu, '');
}

function mapAlias(
  table: Readonly<Record<string, string>>,
  schemaValues: ReadonlyArray<string>,
): (v: unknown) => unknown {
  return (v) => {
    if (typeof v !== 'string') return v;
    const k = normalizeKey(v);
    if (schemaValues.includes(k)) return k;
    const aliased = table[k];
    return aliased ?? v;
  };
}

/**
 * Loose lieu shape so the LLM has freedom to emit free-form labels;
 * we resolve to canonical via `resolveLieu` post-validation.
 *
 * Each enum field uses a `z.preprocess` aliasing layer that maps
 * common LLM-drift values into the canonical taxonomy. Unknown values
 * propagate through and trigger a clean dropping at post-validation
 * (one entry lost, the batch as a whole keeps going).
 */
const LlmAxesItemSchema = z.object({
  slug: z.string(),
  types: z.preprocess((v) => {
    if (!Array.isArray(v)) return [];
    return v
      .map((x) => {
        if (typeof x !== 'string') return x;
        const k = normalizeKey(x);
        if (HotelTypeSchema.options.includes(k as never)) return k;
        if (k === 'all-suite' || k === 'allsuite' || k === '5-star') return '5-etoiles';
        if (k === '4-star') return '4-etoiles';
        if (k === 'design-hotel' || k === 'designhotel') return 'boutique-hotel';
        return x;
      })
      .filter((x) => HotelTypeSchema.options.includes(x as never));
  }, z.array(HotelTypeSchema).default([])),
  lieu: z.object({
    scope: z.preprocess(
      mapAlias(SCOPE_ALIASES, LieuScopeSchema.options),
      LieuScopeSchema.default('france'),
    ),
    raw: z.string().min(1),
  }),
  themes: z.preprocess((v) => {
    if (!Array.isArray(v)) return [];
    return v
      .map((x) => mapAlias(THEME_ALIASES, ThemeSchema.options)(x))
      .filter((x) => ThemeSchema.options.includes(x as never));
  }, z.array(ThemeSchema).default([])),
  occasions: z.preprocess((v) => {
    if (!Array.isArray(v)) return [];
    return v
      .map((x) => mapAlias(OCCASION_ALIASES, OccasionSchema.options)(x))
      .filter((x) => OccasionSchema.options.includes(x as never));
  }, z.array(OccasionSchema).default([])),
  saison: z.preprocess(
    mapAlias(SAISON_ALIASES, SaisonSchema.options),
    SaisonSchema.default('toute-annee'),
  ),
});

const LlmAxesPayloadSchema = z.object({
  items: z.array(LlmAxesItemSchema),
});

// ─── Prompt ──────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Tu es un classificateur taxonomique pour un moteur de classements éditoriaux d'hôtels de luxe. Tu reçois une liste de titres de classements yonder.fr et tu DOIS retourner pour chacun un objet JSON décrivant ses axes (type d'hôtel, lieu géographique, thèmes, occasions, saison).

CONTRAINTES IMPÉRATIVES :
- Format JSON STRICT, aucun markdown, aucun commentaire.
- "slug" = exactement le slug d'entrée (pour matcher).
- "types" = sous-ensemble de : palace, 5-etoiles, 4-etoiles, boutique-hotel, chateau, chalet, villa, maison-hotes, resort, ecolodge, insolite, all (utilise "all" si non précisé).
- "lieu.scope" : france | region | departement | cluster | ville | arrondissement | station | monde.
- "lieu.raw" : nom du lieu en lowercase ASCII si évident (ex: "paris", "cote-d-azur", "courchevel", "corse", "champagne", "alpilles", "france"). Pas d'invention.
- "themes" : sous-ensemble de : romantique, famille, spa-bienetre, gastronomie, design, patrimoine, vignobles, mer, montagne, campagne, urbain, sport-golf, sport-tennis, sport-padel, sport-surf, sport-ski, rooftop, piscine, kids-friendly, insolite (vide si rien ne s'applique).
- "occasions" : sous-ensemble de : week-end, lune-de-miel, anniversaire, seminaire, mariage, escapade, staycation, fetes, minceur (vide si rien ne s'applique).
- "saison" : ete | hiver | printemps | automne | toute-annee.

EXEMPLES :
- "Les meilleurs hôtels 5 étoiles de Paris" → {types:["5-etoiles"], lieu:{scope:"ville", raw:"paris"}, themes:[], occasions:[], saison:"toute-annee"}
- "Hôtels avec spa pour un week-end bien-être" → {types:["all"], lieu:{scope:"france", raw:"france"}, themes:["spa-bienetre"], occasions:["week-end"], saison:"toute-annee"}
- "Les plus beaux hôtels de Courchevel" → {types:["all"], lieu:{scope:"station", raw:"courchevel"}, themes:["montagne","sport-ski"], occasions:[], saison:"hiver"}
- "Hôtels romantiques pour la Saint-Valentin à Paris" → {types:["all"], lieu:{scope:"ville", raw:"paris"}, themes:["romantique"], occasions:["anniversaire"], saison:"toute-annee"}

Retourne TOUJOURS un objet { items: [...] } avec autant d'entrées que de titres reçus.`;

function buildPrompt(batch: ReadonlyArray<YonderTopMin>): string {
  const lines: string[] = [];
  lines.push('Classe chacun des classements suivants en émettant pour chacun ses axes.');
  lines.push('');
  lines.push('Liste à classer :');
  for (const t of batch) {
    const excerpt = t.excerpt ? ` — "${t.excerpt.slice(0, 120)}"` : '';
    lines.push(`- slug="${t.slug}" titre="${t.title}"${excerpt}`);
  }
  lines.push('');
  lines.push('Retourne UNIQUEMENT le JSON strict :');
  lines.push('{ "items": [{slug,types,lieu:{scope,raw},themes,occasions,saison}, ...] }');
  return lines.join('\n');
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function loadIndex(): Promise<ReadonlyArray<YonderTopMin>> {
  const raw = await readFile(IN_PATH, 'utf-8');
  const parsed = JSON.parse(raw) as { french: ReadonlyArray<YonderTopMin> };
  return parsed.french.map((e) => ({
    slug: e.slug,
    title: e.title,
    excerpt: e.excerpt ?? null,
  }));
}

async function loadExisting(): Promise<Map<string, ClassifiedYonderTop>> {
  const out = new Map<string, ClassifiedYonderTop>();
  if (NO_CACHE) return out;
  try {
    const raw = await readFile(OUT_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as ClassifiedFile;
    for (const e of parsed.entries) out.set(e.slug, e);
  } catch {
    // first run
  }
  return out;
}

async function persist(byslug: Map<string, ClassifiedYonderTop>): Promise<void> {
  const entries = [...byslug.values()].sort((a, b) => a.slug.localeCompare(b.slug));
  const resolved = entries.filter((e) => e.lieuResolved).length;
  const file: ClassifiedFile = {
    classifiedAt: new Date().toISOString(),
    total: entries.length,
    resolved,
    unresolved: entries.length - resolved,
    entries,
  };
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(file, null, 2), 'utf-8');
}

async function main(): Promise<void> {
  const env = loadEnv();
  const provider = resolveProvider(env);
  const client = buildLlmClient(env, provider);
  console.log(`[classify-axes] using ${provider}/${client.model}`);

  const tops = await loadIndex();
  const existing = await loadExisting();
  const todo = tops.filter((t) => !existing.has(t.slug));
  console.log(
    `[classify-axes] ${tops.length} FR tops, ${existing.size} already classified, ${todo.length} to classify.`,
  );

  if (todo.length === 0) {
    console.log('[classify-axes] nothing to do.');
    await persist(existing);
    return;
  }

  const totalBatches = Math.ceil(todo.length / BATCH_SIZE);
  for (let b = 0; b < totalBatches; b += 1) {
    const start = b * BATCH_SIZE;
    const batch = todo.slice(start, start + BATCH_SIZE);
    process.stdout.write(`  → batch ${b + 1}/${totalBatches} (${batch.length} entries) … `);

    let parsed: z.infer<typeof LlmAxesPayloadSchema> | null = null;
    let attempt = 0;
    let lastErr: string | null = null;
    while (attempt < 3 && parsed === null) {
      attempt += 1;
      try {
        const result = await client.call({
          systemPrompt: SYSTEM_PROMPT,
          userPrompt: buildPrompt(batch),
          temperature: 0.2,
          maxOutputTokens: 4000,
          responseFormat: 'json',
        });
        const json = JSON.parse(result.content) as unknown;
        const validation = LlmAxesPayloadSchema.safeParse(json);
        if (validation.success) {
          parsed = validation.data;
        } else {
          lastErr = validation.error.issues
            .slice(0, 3)
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .join('; ');
        }
      } catch (err) {
        lastErr = err instanceof Error ? err.message : String(err);
      }
    }
    if (parsed === null) {
      console.log(`FAILED after 3 attempts (${lastErr ?? 'unknown'})`);
      continue;
    }

    let added = 0;
    for (const item of parsed.items) {
      const top = batch.find((b2) => b2.slug === item.slug);
      if (!top) continue;
      const lieu = resolveLieu(item.lieu.raw);
      const axes: RankingAxes = RankingAxesSchema.parse({
        types: item.types,
        lieu:
          lieu !== null
            ? { scope: lieu.scope, slug: lieu.slug, label: lieu.label }
            : { scope: item.lieu.scope, slug: item.lieu.raw, label: item.lieu.raw },
        themes: item.themes,
        occasions: item.occasions,
        saison: item.saison,
      });
      existing.set(top.slug, {
        slug: top.slug,
        title: top.title,
        excerpt: top.excerpt,
        axes,
        llmLieuRaw: item.lieu.raw,
        lieuResolved: lieu !== null,
      });
      added += 1;
    }
    console.log(`+${added}`);
    await persist(existing);
  }

  console.log('\n━━━ Summary ━━━');
  await persist(existing);
  const final = [...existing.values()];
  console.log(`  Total classified:        ${final.length}`);
  console.log(`  Lieu resolved (canon):   ${final.filter((e) => e.lieuResolved).length}`);
  console.log(`  Lieu unresolved:         ${final.filter((e) => !e.lieuResolved).length}`);
  console.log(`\n✓ Wrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error('[classify-yonder-axes] FAILED:', err);
  process.exit(1);
});
