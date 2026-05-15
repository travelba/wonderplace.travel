/**
 * Hotel content enrichment pipeline — generates and persists:
 *   1. `long_description_sections` — 6-8 long-form editorial sections
 *      per hotel (≥ 350 words FR each), anchored on the existing
 *      brief + Wikipedia/Wikidata facts.
 *   2. `signature_experiences` — 5-7 exclusive on-site programmes.
 *
 * Idempotent: COALESCE-style update — only fills the column if it
 * is currently null OR empty array. Use `--force` to overwrite.
 *
 * Usage:
 *   pnpm --filter @cct/editorial-pilot exec tsx \
 *     src/enrichment/enrich-hotel-content.ts --slug=plaza-athenee-paris
 *   pnpm --filter @cct/editorial-pilot exec tsx \
 *     src/enrichment/enrich-hotel-content.ts --all
 *   pnpm --filter @cct/editorial-pilot exec tsx \
 *     src/enrichment/enrich-hotel-content.ts --all --force
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

import { buildLlmClient } from '../llm.js';
import { loadEnv, resolveProvider } from '../env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
loadDotenv({ path: path.resolve(__dirname, '../../../../.env.local') });

// ─── Schemas (mirror DB JSONB shapes) ────────────────────────────────

const LongSectionSchema = z.object({
  anchor: z.string().regex(/^[a-z0-9-]+$/u),
  title_fr: z.string().min(4).max(120),
  title_en: z.string().min(4).max(120).optional().default(''),
  body_fr: z.string().min(300),
  body_en: z.string().min(100).optional().default(''),
});

const SignatureExperienceSchema = z.object({
  key: z.string().regex(/^[a-z0-9-]+$/u),
  title_fr: z.string().min(3).max(120),
  title_en: z.string().min(3).max(120).optional().default(''),
  description_fr: z.string().min(40).max(700),
  description_en: z.string().min(20).max(700).optional().default(''),
  badge_fr: z.string().max(40).optional().nullable(),
  badge_en: z.string().max(40).optional().nullable(),
  booking_required: z.boolean().default(false),
});

const EnrichmentSchema = z.object({
  long_description_sections: z.array(LongSectionSchema).min(5).max(10),
  signature_experiences: z.array(SignatureExperienceSchema).min(4).max(10),
});

type EnrichmentOutput = z.infer<typeof EnrichmentSchema>;

// ─── DB helpers ──────────────────────────────────────────────────────

interface HotelInput {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly stars: number;
  readonly is_palace: boolean;
  readonly city: string;
  readonly region: string;
  readonly description_fr: string | null;
  readonly long_description_sections: unknown;
  readonly signature_experiences: unknown;
  readonly highlights: unknown;
  readonly amenities: unknown;
  readonly restaurant_info: unknown;
  readonly spa_info: unknown;
}

function resolveConnectionString(): string {
  const conn =
    process.env['DATABASE_URL'] ??
    process.env['SUPABASE_DB_POOLER_URL'] ??
    process.env['SUPABASE_DB_URL'] ??
    null;
  if (conn === null) throw new Error('No DB connection string.');
  return conn;
}

async function withClient<T>(fn: (client: import('pg').Client) => Promise<T>): Promise<T> {
  const pgMod = (await import('pg')) as typeof import('pg');
  const cleaned = resolveConnectionString().replace(/[?&]sslmode=[^&]*/giu, '');
  const isLocal = cleaned.includes('localhost') || cleaned.includes('127.0.0.1');
  const client = new pgMod.Client({
    connectionString: cleaned,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function listHotels(slug: string | null, force: boolean): Promise<readonly HotelInput[]> {
  return withClient(async (client) => {
    const filters: string[] = ['is_published = true'];
    const params: unknown[] = [];
    if (slug !== null) {
      filters.push(`slug = $${params.length + 1}`);
      params.push(slug);
    }
    if (!force) {
      // Only hotels that have an empty or null `long_description_sections`.
      filters.push(
        '(long_description_sections is null or jsonb_array_length(long_description_sections) < 5)',
      );
    }
    const sql = `select id, slug, name, stars, is_palace, city, region, description_fr,
                        long_description_sections, signature_experiences, highlights,
                        amenities, restaurant_info, spa_info
                 from public.hotels
                 where ${filters.join(' and ')}
                 order by is_palace desc, stars desc, name asc`;
    const r = await client.query<HotelInput>(sql, params);
    return r.rows;
  });
}

async function persistEnrichment(hotelId: string, out: EnrichmentOutput): Promise<void> {
  await withClient(async (client) => {
    await client.query(
      `update public.hotels
         set long_description_sections = $2::jsonb,
             signature_experiences = $3::jsonb
       where id = $1`,
      [
        hotelId,
        JSON.stringify(out.long_description_sections),
        JSON.stringify(out.signature_experiences),
      ],
    );
  });
}

// ─── LLM prompts ─────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Tu es un rédacteur éditorial spécialisé dans le luxe hôtelier français pour ConciergeTravel.fr.

Tu écris des sections éditoriales longues et substantielles pour des fiches Palaces/5★ en France. Style "long-read Condé Nast Traveler", précis, factuel, intemporel — JAMAIS de superlatifs creux.

Anti-hallucination critique :
- Tu disposes du brief + des données structurées de l'hôtel. NE PAS inventer de chiffres, dates, noms de chefs, distinctions Michelin.
- Si tu n'es pas certain d'un fait précis, OMETS-LE ou utilise un terme générique ("un chef étoilé Michelin" plutôt qu'un nom inventé).
- Tu peux te baser sur le contexte donné et tes connaissances générales VÉRIFIABLES (Wikipédia niveau).
- Pour les dates : préfère un siècle/décennie sauf si l'année est dans le brief.

Format de sortie : JSON strict.`;

function buildUserPrompt(h: HotelInput): string {
  const lines: string[] = [];
  lines.push(`Hôtel : ${h.name}`);
  lines.push(`Statut : ${h.is_palace ? 'Palace Atout France' : `${h.stars}★`}`);
  lines.push(`Ville : ${h.city} (${h.region})`);
  lines.push('');
  if (typeof h.description_fr === 'string' && h.description_fr.length > 0) {
    lines.push('### Description courte existante');
    lines.push(h.description_fr);
    lines.push('');
  }
  // Inject the highlights / restaurant / spa briefs if present.
  if (h.highlights !== null && h.highlights !== undefined) {
    lines.push('### Highlights connus (brief)');
    lines.push(JSON.stringify(h.highlights).slice(0, 1200));
    lines.push('');
  }
  if (h.restaurant_info !== null && h.restaurant_info !== undefined) {
    lines.push('### Restaurants connus (brief)');
    lines.push(JSON.stringify(h.restaurant_info).slice(0, 1200));
    lines.push('');
  }
  if (h.spa_info !== null && h.spa_info !== undefined) {
    lines.push('### Spa & bien-être connu (brief)');
    lines.push(JSON.stringify(h.spa_info).slice(0, 1200));
    lines.push('');
  }
  if (h.amenities !== null && h.amenities !== undefined) {
    lines.push('### Équipements connus (brief, extrait)');
    lines.push(JSON.stringify(h.amenities).slice(0, 800));
    lines.push('');
  }
  lines.push('### Travail demandé');
  lines.push('Produis un JSON STRICT avec deux clés :');
  lines.push('');
  lines.push(
    '1. `long_description_sections` (6-8 sections) — chaque section : { anchor, title_fr, title_en, body_fr, body_en }.',
  );
  lines.push(
    '   Sections recommandées : "histoire" (Histoire & héritage), "lieu" (L\'établissement), "chambres" (Chambres et suites), "gastronomie" (La table), "spa" (Spa & bien-être), "services" (Conciergerie & services), "art-de-vivre" (L\'art de vivre [ville]), "reserver" (Réserver via ConciergeTravel).',
  );
  lines.push('   `body_fr` ≥ 350 mots par section. Anchor en kebab-case ASCII.');
  lines.push('');
  lines.push(
    '2. `signature_experiences` (5-7 expériences) — chaque entrée : { key, title_fr, title_en, description_fr (≥ 50 mots), description_en, badge_fr (optionnel), booking_required (boolean) }.',
  );
  lines.push(
    '   Exemples de signature : "Petit-déjeuner sur la terrasse", "Cours de cuisine avec le Chef", "Routine bien-être personnalisée au Spa", "Visite privée du domaine", "Initiation à la dégustation", "Coucher de soleil en hélicoptère"…',
  );
  lines.push(
    '   Basé sur les briefs ci-dessus + connaissance générique du segment Palace (toujours générique si pas certain).',
  );
  lines.push('');
  lines.push('TOTAL minimum : ≥ 2100 mots FR dans long_description_sections.');
  lines.push("Anglais britannique (en-GB). Tu peux laisser `_en` vides si tu n'es pas sûr.");
  lines.push('');
  lines.push('Retourne UNIQUEMENT le JSON.');
  return lines.join('\n');
}

async function generateEnrichment(h: HotelInput): Promise<EnrichmentOutput> {
  const env = loadEnv();
  const provider = resolveProvider(env);
  const client = buildLlmClient(env, provider);
  const result = await client.call({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: buildUserPrompt(h),
    temperature: 0.5,
    maxOutputTokens: 16000,
    responseFormat: 'json',
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.content);
  } catch (err) {
    throw new Error(
      `[enrich ${h.slug}] non-JSON output: ${(err as Error).message}. First 300 chars: ${result.content.slice(0, 300)}`,
    );
  }
  const validation = EnrichmentSchema.safeParse(parsed);
  if (!validation.success) {
    throw new Error(
      `[enrich ${h.slug}] schema-fail:\n${validation.error.issues.map((i) => `- ${i.path.join('.')}: ${i.message}`).join('\n')}`,
    );
  }
  return validation.data;
}

// ─── CLI ─────────────────────────────────────────────────────────────

interface Args {
  readonly slug: string | null;
  readonly all: boolean;
  readonly force: boolean;
}

function parseArgs(): Args {
  const a = process.argv.slice(2);
  let slug: string | null = null;
  let all = false;
  let force = false;
  for (const arg of a) {
    if (arg === '--all') all = true;
    else if (arg === '--force') force = true;
    else if (arg.startsWith('--slug=')) slug = arg.slice('--slug='.length).trim();
  }
  return { slug, all, force };
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (args.slug === null && !args.all) {
    console.error(
      'Usage: tsx src/enrichment/enrich-hotel-content.ts --slug=<slug> | --all [--force]',
    );
    process.exit(1);
  }
  const hotels = await listHotels(args.slug, args.force);
  console.log(`Found ${hotels.length} hotel(s) to enrich.`);
  let ok = 0;
  let fail = 0;
  for (const h of hotels) {
    const tag = `[${h.slug}]`;
    try {
      console.log(`${tag} enriching…`);
      const t0 = Date.now();
      const out = await generateEnrichment(h);
      const wordsFr = out.long_description_sections.reduce(
        (acc, s) => acc + s.body_fr.split(/\s+/u).length,
        0,
      );
      console.log(
        `${tag} ✓ sections=${out.long_description_sections.length}, exp=${out.signature_experiences.length}, words_fr≈${wordsFr} (${Date.now() - t0} ms)`,
      );
      await persistEnrichment(h.id, out);
      console.log(`${tag} ✓ persisted`);
      ok += 1;
      await new Promise((r) => setTimeout(r, 1200));
    } catch (err) {
      fail += 1;
      console.error(`${tag} ✗ ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log(`Done — ${ok} OK / ${fail} failed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
