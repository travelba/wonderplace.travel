/**
 * Signature experiences enrichment — fills the `signature_experiences`
 * column for hotels whose value is currently null or empty.
 *
 * Each hotel gets 5-7 exclusive on-site programmes (in-house transport,
 * loyalty perks, dining rituals, in-residence arts, signature spa
 * treatments…). Surfaces as a 3-up card grid on the public fiche.
 *
 * Anti-hallucination guard: the LLM only sees the hotel's name + city
 * + status (Palace / 5★) + existing brief blocks (highlights, dining,
 * spa, amenities). Outputs are typed by Zod before persist.
 *
 * Usage:
 *   pnpm --filter @cct/editorial-pilot exec tsx \
 *     src/enrichment/enrich-signature-experiences.ts --all
 *   pnpm --filter @cct/editorial-pilot exec tsx \
 *     src/enrichment/enrich-signature-experiences.ts --slug=plaza-athenee-paris [--force]
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

const SignatureExperienceSchema = z.object({
  key: z.preprocess(
    (v) =>
      typeof v === 'string'
        ? v
            .trim()
            .toLowerCase()
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/gu, '')
            .replace(/[^a-z0-9-]+/gu, '-')
            .replace(/^-+|-+$/gu, '')
            .replace(/-+/gu, '-')
        : v,
    z
      .string()
      .regex(/^[a-z0-9-]+$/u)
      .min(2)
      .max(60),
  ),
  title_fr: z.string().min(3).max(120),
  title_en: z.string().min(3).max(120).optional().default(''),
  description_fr: z.string().min(40).max(800),
  description_en: z.string().max(800).optional().default(''),
  badge_fr: z.string().max(60).optional().nullable(),
  badge_en: z.string().max(60).optional().nullable(),
  booking_required: z.boolean().default(false),
});

const PayloadSchema = z.object({
  signature_experiences: z.array(SignatureExperienceSchema).min(4).max(10),
});

interface HotelRow {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly stars: number;
  readonly is_palace: boolean;
  readonly city: string;
  readonly region: string;
  readonly description_fr: string | null;
  readonly highlights: unknown;
  readonly amenities: unknown;
  readonly restaurant_info: unknown;
  readonly spa_info: unknown;
  readonly signature_experiences: unknown;
}

function resolveConn(): string {
  const c =
    process.env['DATABASE_URL'] ??
    process.env['SUPABASE_DB_POOLER_URL'] ??
    process.env['SUPABASE_DB_URL'] ??
    null;
  if (c === null) throw new Error('No DB connection');
  return c;
}

async function withClient<T>(fn: (c: import('pg').Client) => Promise<T>): Promise<T> {
  const pgMod = (await import('pg')) as typeof import('pg');
  const conn = resolveConn().replace(/[?&]sslmode=[^&]*/giu, '');
  const isLocal = conn.includes('localhost') || conn.includes('127.0.0.1');
  const c = new pgMod.Client({
    connectionString: conn,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

const SYSTEM_PROMPT = `Tu es un rédacteur éditorial spécialisé dans le luxe hôtelier français pour ConciergeTravel.fr.

Tu produis les "expériences signature" d'un Palace : programmes exclusifs in-situ qui distinguent l'hôtel d'un 5★ classique. Style "long-read Condé Nast Traveler", précis et factuel — JAMAIS de superlatifs creux ("magique", "à couper le souffle", "incroyable").

Anti-hallucination critique :
- Tu disposes du brief de l'hôtel (highlights, restaurants, spa, équipements). Tes signatures DOIVENT être cohérentes avec ce brief.
- NE PAS inventer de noms de chefs/sommeliers/médecins, de partenariats de marques, de distinctions précises.
- Si tu cites un produit/marque, il doit être universellement connu (Guerlain, Dior, La Mer, Veuve Clicquot) OU être déjà dans le brief.
- Sinon, reste générique ("un spa partenaire d'une grande maison de cosmétique française", "un sommelier reconnu").

Format de sortie : JSON strict avec la clé "signature_experiences".`;

function buildPrompt(h: HotelRow): string {
  const lines: string[] = [];
  lines.push(`Hôtel : **${h.name}**`);
  lines.push(`Statut : ${h.is_palace ? 'Palace Atout France' : `${h.stars}★`}`);
  lines.push(`Ville : ${h.city} (${h.region})`);
  lines.push('');
  if (typeof h.description_fr === 'string' && h.description_fr.length > 0) {
    lines.push('### Description courte');
    lines.push(h.description_fr.slice(0, 800));
    lines.push('');
  }
  if (h.highlights !== null && h.highlights !== undefined) {
    lines.push('### Highlights connus');
    lines.push(JSON.stringify(h.highlights).slice(0, 1500));
    lines.push('');
  }
  if (h.restaurant_info !== null && h.restaurant_info !== undefined) {
    lines.push('### Restaurants connus');
    lines.push(JSON.stringify(h.restaurant_info).slice(0, 1500));
    lines.push('');
  }
  if (h.spa_info !== null && h.spa_info !== undefined) {
    lines.push('### Spa connu');
    lines.push(JSON.stringify(h.spa_info).slice(0, 1500));
    lines.push('');
  }
  if (h.amenities !== null && h.amenities !== undefined) {
    lines.push('### Équipements (extrait)');
    lines.push(JSON.stringify(h.amenities).slice(0, 900));
    lines.push('');
  }
  lines.push('### Travail demandé');
  lines.push(
    'Produis 5 à 7 "signature_experiences" — des programmes ou rituels exclusifs in-situ.',
  );
  lines.push('');
  lines.push('Inspire-toi de ces exemples (de vrais Palaces) pour calibrer le ton :');
  lines.push('- "Peninsula Time" : check-in 6h, check-out 22h, sans frais (Peninsula Paris)');
  lines.push('- "Aviator Service" : transfert privé en Rolls-Royce vintage (Cheval Blanc)');
  lines.push(
    '- "Petit-déjeuner sur la terrasse panoramique" : rituel matinal exclusif aux suites (Plaza Athénée)',
  );
  lines.push(
    '- "Initiation à la dégustation" : masterclass avec le sommelier (Domaine Les Crayères)',
  );
  lines.push('- "Routine bien-être personnalisée Dior" : 90 min de soin signature dédié');
  lines.push('- "Coucher de soleil en hélicoptère privé" : survol Côte d\'Azur, retour spa');
  lines.push('- "Cours de cuisine intimiste avec le Chef étoilé" : 4 personnes, marché compris');
  lines.push('- "Soirée jazz en bibliothèque" : cocktail au bar avec live music vendredi');
  lines.push('- "Atelier sommelier dégustation Champagnes Grands Crus" (Royal Champagne)');
  lines.push('- "Ski-room privatif + service ski valet" : ski-in/ski-out alpin');
  lines.push('');
  lines.push('Format chaque entrée :');
  lines.push(
    '{ key, title_fr (3-8 mots), title_en, description_fr (60-180 mots, précis et factuel), description_en, badge_fr (optionnel, ex: "Inclus", "Sur réservation", "Pour les Loyalty"), badge_en, booking_required (boolean) }',
  );
  lines.push('');
  lines.push('Contraintes :');
  lines.push('- `key` : kebab-case ASCII (ex: "petit-dejeuner-terrasse", "ski-valet-prive")');
  lines.push("- Anglais britannique (en-GB), peut être vide si tu n'es pas sûr");
  lines.push(
    '- Adapter les signatures à la SAISON et au LIEU (montagne en hiver, mer en été, urbain à Paris…)',
  );
  lines.push('- 5 à 7 entrées (sweet spot : 6)');
  lines.push('');
  lines.push('Retourne UNIQUEMENT le JSON : { "signature_experiences": [ ... ] }');
  return lines.join('\n');
}

async function generateForHotel(
  h: HotelRow,
): Promise<readonly z.infer<typeof SignatureExperienceSchema>[]> {
  const env = loadEnv();
  const provider = resolveProvider(env);
  const llm = buildLlmClient(env, provider);
  const result = await llm.call({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: buildPrompt(h),
    temperature: 0.6,
    maxOutputTokens: 6000,
    responseFormat: 'json',
  });
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.content);
  } catch (err) {
    throw new Error(
      `non-JSON output: ${(err as Error).message}. First 200 chars: ${result.content.slice(0, 200)}`,
    );
  }
  const validation = PayloadSchema.safeParse(parsed);
  if (!validation.success) {
    throw new Error(
      `schema-fail:\n${validation.error.issues.map((i) => `- ${i.path.join('.')}: ${i.message}`).join('\n')}`,
    );
  }
  return validation.data.signature_experiences;
}

interface Args {
  readonly slug: string | null;
  readonly all: boolean;
  readonly force: boolean;
}
function parseArgs(): Args {
  const args = process.argv.slice(2);
  let slug: string | null = null;
  let all = false;
  let force = false;
  for (const a of args) {
    if (a === '--all') all = true;
    else if (a === '--force') force = true;
    else if (a.startsWith('--slug=')) slug = a.slice('--slug='.length).trim();
  }
  return { slug, all, force };
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (args.slug === null && !args.all) {
    console.error(
      'Usage: tsx src/enrichment/enrich-signature-experiences.ts --slug=<slug> | --all [--force]',
    );
    process.exit(1);
  }

  const hotels = await withClient(async (c) => {
    const filters: string[] = ['is_published = true'];
    const params: unknown[] = [];
    if (args.slug !== null) {
      filters.push(`slug = $${params.length + 1}`);
      params.push(args.slug);
    }
    if (!args.force) {
      filters.push(
        '(signature_experiences is null or jsonb_array_length(signature_experiences) < 4)',
      );
    }
    const r = await c.query<HotelRow>(
      `select id, slug, name, stars, is_palace, city, region, description_fr,
              highlights, amenities, restaurant_info, spa_info, signature_experiences
       from public.hotels
       where ${filters.join(' and ')}
       order by is_palace desc, stars desc, name asc`,
      params,
    );
    return r.rows;
  });
  console.log(`Found ${hotels.length} hotel(s) needing signature_experiences.`);

  let ok = 0;
  let fail = 0;
  for (const h of hotels) {
    const tag = `[${h.slug}]`;
    try {
      const t0 = Date.now();
      const sigs = await generateForHotel(h);
      console.log(`${tag} ✓ ${sigs.length} signatures (${Date.now() - t0} ms)`);
      await withClient(async (c) => {
        await c.query(`update public.hotels set signature_experiences = $2::jsonb where id = $1`, [
          h.id,
          JSON.stringify(sigs),
        ]);
      });
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
