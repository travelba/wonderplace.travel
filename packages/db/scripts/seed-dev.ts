/**
 * Dev/preview-only seed for ConciergeTravel.fr.
 *
 * Inserts three palace hotels (idempotent — `ON CONFLICT (slug)`), publishes
 * them in `booking_mode = 'amadeus'`, and — if the Algolia admin credentials
 * are present — pushes them into the `hotels_<locale>` indices so they are
 * immediately discoverable from `/recherche`.
 *
 * Refuses to run when `NODE_ENV === 'production'` or `SEED_ALLOW_PROD !== 'true'`.
 *
 * Usage (from repo root):
 *   pnpm --filter @cct/db seed:dev
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

interface HotelSeed {
  readonly slug: string;
  readonly slug_en: string;
  readonly name: string;
  readonly name_en: string;
  readonly region: string;
  readonly department: string;
  readonly city: string;
  readonly district: string | null;
  readonly address: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly is_palace: boolean;
  readonly stars: 5;
  readonly description_fr: string;
  readonly description_en: string;
  readonly amenities: readonly string[];
  readonly highlights: readonly string[];
  readonly priority: 'P0' | 'P1' | 'P2';
}

const SEEDS: readonly HotelSeed[] = [
  {
    slug: 'le-bristol-paris',
    slug_en: 'le-bristol-paris',
    name: 'Le Bristol Paris',
    name_en: 'Le Bristol Paris',
    region: 'Île-de-France',
    department: 'Paris',
    city: 'Paris',
    district: '8ᵉ arrondissement',
    address: '112 Rue du Faubourg Saint-Honoré, 75008 Paris',
    latitude: 48.8721,
    longitude: 2.3158,
    is_palace: true,
    stars: 5,
    description_fr:
      "Palace parisien historique du Faubourg Saint-Honoré, Le Bristol incarne l'art de recevoir à la française : 188 chambres et suites, restaurant triplement étoilé Epicure, spa La Prairie et piscine panoramique sur les toits.",
    description_en:
      'A landmark Parisian palace on Faubourg Saint-Honoré, Le Bristol embodies French hospitality at its finest: 188 rooms and suites, three-Michelin-starred Epicure restaurant, La Prairie spa, and a rooftop pool with panoramic views.',
    amenities: ['spa', 'pool', 'michelin_restaurant', 'concierge_24h', 'valet', 'pet_friendly'],
    highlights: ['Distinction Palace', 'Restaurant 3★ Michelin', 'Piscine panoramique sur le toit'],
    priority: 'P0',
  },
  {
    slug: 'hotel-du-cap-eden-roc',
    slug_en: 'hotel-du-cap-eden-roc',
    name: 'Hôtel du Cap-Eden-Roc',
    name_en: 'Hôtel du Cap-Eden-Roc',
    region: "Provence-Alpes-Côte d'Azur",
    department: 'Alpes-Maritimes',
    city: 'Antibes',
    district: 'Cap d’Antibes',
    address: 'Boulevard J.F. Kennedy, 06160 Antibes',
    latitude: 43.5489,
    longitude: 7.1267,
    is_palace: true,
    stars: 5,
    description_fr:
      "Légende méditerranéenne ouverte en 1870, l'Hôtel du Cap-Eden-Roc déploie ses jardins de 9 hectares à la pointe du Cap d'Antibes. Piscine d'eau de mer taillée dans la roche, pavillon Eden-Roc, marina privée.",
    description_en:
      'A Mediterranean legend established in 1870, Hôtel du Cap-Eden-Roc unfolds 22 acres of gardens at the tip of Cap d’Antibes. Saltwater pool carved into the rock, Eden-Roc pavilion, private marina.',
    amenities: ['private_beach', 'pool', 'spa', 'tennis', 'marina', 'helipad'],
    highlights: ['Distinction Palace', 'Piscine taillée dans la roche', 'Pavillon Eden-Roc'],
    priority: 'P0',
  },
  {
    slug: 'cheval-blanc-courchevel',
    slug_en: 'cheval-blanc-courchevel',
    name: 'Cheval Blanc Courchevel',
    name_en: 'Cheval Blanc Courchevel',
    region: 'Auvergne-Rhône-Alpes',
    department: 'Savoie',
    city: 'Courchevel',
    district: 'Courchevel 1850',
    address: 'Le Jardin Alpin, 73120 Courchevel',
    latitude: 45.4144,
    longitude: 6.6347,
    is_palace: true,
    stars: 5,
    description_fr:
      'Premier Cheval Blanc de la Maison LVMH, ouvert en 2006 au cœur du Jardin Alpin. 36 chambres et suites ski-in/ski-out, restaurant Le 1947 (3★ Michelin), spa Guerlain, accès direct aux 3 Vallées.',
    description_en:
      'The flagship Cheval Blanc by LVMH, opened in 2006 in the heart of the Jardin Alpin. 36 ski-in/ski-out rooms and suites, Le 1947 restaurant (3★ Michelin), Guerlain spa, direct access to Les 3 Vallées.',
    amenities: ['ski_in_ski_out', 'spa', 'michelin_restaurant', 'concierge_24h', 'kids_club'],
    highlights: [
      'Distinction Palace',
      'Restaurant Le 1947 (3★ Michelin)',
      'Ski-in/ski-out 3 Vallées',
    ],
    priority: 'P0',
  },
];

function refuseInProd(env: {
  readonly NODE_ENV?: string | undefined;
  readonly SEED_ALLOW_PROD?: string | undefined;
}): boolean {
  if (env.NODE_ENV === 'production' && env.SEED_ALLOW_PROD !== 'true') {
    console.error(
      '[seed:dev] refusing to run in production. Set SEED_ALLOW_PROD=true to override.',
    );
    return true;
  }
  return false;
}

/**
 * Strip the readonly variance and feed the value to `postgres.js` as
 * a structurally-typed `JSONValue`. `JSON.parse(JSON.stringify(...))`
 * is the canonical way to do this without an `as any` cast — it also
 * normalises any non-JSON-safe values (Map, Set, Date, undefined)
 * that might sneak into a seed payload.
 *
 * Why this exists at all
 * ----------------------
 * Older revisions of this seed used `${JSON.stringify(value)}::jsonb`.
 * That works for arrays of primitives (postgres.js binds the
 * stringified payload as TEXT and the explicit `::jsonb` cast parses
 * it back into a `jsonb` array on the server). It silently breaks
 * the moment we introduce arrays of objects — depending on driver
 * version, the value can end up stored as a `jsonb` scalar STRING
 * (`jsonb_typeof = 'string'`) instead of an array, and the SELECT
 * side then fails Zod validation in a non-obvious way.
 *
 * Migrating every jsonb column to `sql.json()` makes the binding
 * type-safe regardless of the payload shape and matches the pattern
 * used in `seed-peninsula-paris.ts`.
 */
function toJson(value: unknown): postgres.JSONValue {
  return JSON.parse(JSON.stringify(value)) as postgres.JSONValue;
}

async function upsertHotel(
  sql: postgres.Sql,
  seed: HotelSeed,
): Promise<{ readonly id: string; readonly inserted: boolean }> {
  const rows = await sql<Array<{ id: string; inserted: boolean }>>`
    insert into public.hotels (
      slug, slug_en, name, name_en,
      region, department, city, district, address,
      latitude, longitude,
      stars, is_palace, booking_mode, priority, is_published,
      description_fr, description_en,
      amenities, highlights
    )
    values (
      ${seed.slug}, ${seed.slug_en}, ${seed.name}, ${seed.name_en},
      ${seed.region}, ${seed.department}, ${seed.city}, ${seed.district}, ${seed.address},
      ${seed.latitude}, ${seed.longitude},
      ${seed.stars}, ${seed.is_palace}, 'amadeus', ${seed.priority}, true,
      ${seed.description_fr}, ${seed.description_en},
      ${sql.json(toJson(seed.amenities))}, ${sql.json(toJson(seed.highlights))}
    )
    on conflict (slug) do update set
      slug_en = excluded.slug_en,
      name = excluded.name,
      name_en = excluded.name_en,
      region = excluded.region,
      department = excluded.department,
      city = excluded.city,
      district = excluded.district,
      address = excluded.address,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      stars = excluded.stars,
      is_palace = excluded.is_palace,
      booking_mode = excluded.booking_mode,
      priority = excluded.priority,
      is_published = excluded.is_published,
      description_fr = excluded.description_fr,
      description_en = excluded.description_en,
      amenities = excluded.amenities,
      highlights = excluded.highlights,
      updated_at = timezone('utc', now())
    returning id, (xmax = 0) as inserted
  `;
  const row = rows[0];
  if (row === undefined) {
    throw new Error(`upsert returned no row for slug ${seed.slug}`);
  }
  return { id: row.id, inserted: row.inserted };
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

async function maybeIndexAlgolia(
  algoliaEnv: AlgoliaEnv,
  rows: ReadonlyArray<{ id: string; seed: HotelSeed }>,
): Promise<void> {
  const algoliaAdmin = await import('@cct/integrations/algolia-admin');
  const svc = algoliaAdmin.createAlgoliaIndexingService({
    appId: algoliaEnv.appId,
    apiKey: algoliaEnv.apiKey,
    indexPrefix: algoliaEnv.indexPrefix,
  });

  for (const { id, seed } of rows) {
    const r = await algoliaAdmin.syncHotelPublicationToAlgolia(svc, {
      id,
      slug: seed.slug,
      slug_en: seed.slug_en,
      name: seed.name,
      name_en: seed.name_en,
      city: seed.city,
      district: seed.district,
      region: seed.region,
      is_palace: seed.is_palace,
      stars: seed.stars,
      amenities: seed.amenities,
      highlights: seed.highlights,
      description_fr: seed.description_fr,
      description_en: seed.description_en,
      is_little_catalog: false,
      priority: seed.priority,
      google_rating: null,
      google_reviews_count: null,
      is_published: true,
    });
    if (!r.ok) {
      console.warn(`[seed:dev] algolia indexing failed for ${seed.slug}:`, r.error);
    } else {
      console.info(`[seed:dev] indexed ${seed.slug} in Algolia (fr + en)`);
    }
  }
}

async function main(): Promise<void> {
  const parsedEnv = Env.safeParse(process.env);
  if (!parsedEnv.success) {
    console.error('[seed:dev] invalid env:', parsedEnv.error.flatten());
    process.exitCode = 1;
    return;
  }
  if (refuseInProd(parsedEnv.data)) {
    process.exitCode = 1;
    return;
  }

  const sql = postgres(parsedEnv.data.SUPABASE_DB_URL, {
    max: 1,
    onnotice: () => undefined,
  });

  try {
    const inserted: Array<{ id: string; seed: HotelSeed }> = [];
    for (const seed of SEEDS) {
      const { id, inserted: wasInsert } = await upsertHotel(sql, seed);
      console.info(
        `[seed:dev] ${wasInsert ? 'inserted' : 'updated '} ${seed.slug.padEnd(28)} → ${id}`,
      );
      inserted.push({ id, seed });
    }

    const algoliaEnv = readAlgoliaEnv();
    if (algoliaEnv === null) {
      console.info('[seed:dev] Algolia env not set — skipping index push.');
    } else {
      console.info('[seed:dev] pushing FR + EN records to Algolia…');
      await maybeIndexAlgolia(algoliaEnv, inserted);
    }

    console.info('[seed:dev] done.');
    console.info('');
    console.info('Hotel IDs (use with /recherche → "Réserver mode test"):');
    for (const { id, seed } of inserted) {
      console.info(`  ${id}  ${seed.name}`);
    }
  } catch (error) {
    console.error('[seed:dev] failed:', error);
    process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

void main().catch((error) => {
  console.error('[seed:dev] unhandled:', error);
  process.exit(1);
});
