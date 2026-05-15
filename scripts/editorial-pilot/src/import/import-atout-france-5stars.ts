/**
 * Bulk import of Atout France 5★ hotels (non-Palace) to extend the
 * catalog from 30 → ~100 entries, unlocking the combinatorial matrix
 * for the rankings pipeline (`run-rankings-v2-bulk.ts`).
 *
 * Strategy
 * --------
 *   1. Parse `data/atout-france-raw.csv` (semicolon-separated, French
 *      DGE export of every classified tourism hotel).
 *   2. Keep only 5★ rows (`CLASSEMENT = "5 étoiles"`).
 *   3. De-duplicate against the live `public.hotels` table (slug + name
 *      collision check via Supabase pg client).
 *   4. Diversify regions — prioritise hotels in regions that are
 *      currently under-represented (Bretagne, Normandie, Occitanie,
 *      Pays-de-la-Loire, Grand Est, Hauts-de-France, Bourgogne,
 *      Centre, Corse).
 *   5. Cap at `--max=70` (default) and at most `--per-city=2` to avoid
 *      city clusters that would skew the geographic ranking matrix.
 *   6. Insert minimally-populated rows with `is_published = TRUE` so
 *      the rankings pipeline picks them up. The detail page applies a
 *      `noindex` automatically when `long_description_sections` is
 *      empty (see `apps/web/src/app/[locale]/hotel/[slug]/page.tsx`).
 *
 * The script is idempotent: re-running skips rows whose generated slug
 * already exists in the table (matched on `lower(slug)`).
 *
 * Usage
 * -----
 *   pnpm --filter @cct/editorial-pilot exec tsx \
 *     src/import/import-atout-france-5stars.ts \
 *     [--max=70] [--per-city=2] [--dry-run]
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
loadDotenv({ path: path.resolve(__dirname, '../../../../.env.local') });

interface CliArgs {
  readonly max: number;
  readonly perCity: number;
  readonly dryRun: boolean;
}

function parseArgs(): CliArgs {
  let max = 70;
  let perCity = 2;
  let dryRun = false;
  for (const a of process.argv.slice(2)) {
    if (a === '--dry-run') dryRun = true;
    else if (a.startsWith('--max=')) {
      const v = Number(a.slice('--max='.length));
      if (Number.isFinite(v) && v > 0) max = Math.floor(v);
    } else if (a.startsWith('--per-city=')) {
      const v = Number(a.slice('--per-city='.length));
      if (Number.isFinite(v) && v > 0) perCity = Math.floor(v);
    }
  }
  return { max, perCity, dryRun };
}

interface AtoutRow {
  readonly typology: string;
  readonly classement: string;
  readonly name: string;
  readonly address: string;
  readonly postalCode: string;
  readonly commune: string;
  readonly website: string;
  readonly capacity: number | null;
  readonly numberOfRooms: number | null;
}

function parseCsvLine(line: string): readonly string[] {
  // Atout France CSV uses `;` separator and never quotes.
  return line.split(';').map((s) => s.trim());
}

async function loadCsv(csvPath: string): Promise<readonly AtoutRow[]> {
  const raw = await readFile(csvPath, 'utf-8');
  const lines = raw.split(/\r?\n/u).filter((l) => l.trim().length > 0);
  const header = parseCsvLine(lines[0] ?? '');
  const idx = (name: string): number => header.findIndex((h) => h.toUpperCase() === name);
  const iTy = idx('TYPOLOGIE ÉTABLISSEMENT');
  const iCl = idx('CLASSEMENT');
  const iName = idx('NOM COMMERCIAL');
  const iAddr = idx('ADRESSE');
  const iPC = idx('CODE POSTAL');
  const iCom = idx('COMMUNE');
  const iWeb = idx('SITE INTERNET');
  const iCap = idx("CAPACITÉ D'ACCUEIL (PERSONNES)");
  const iRooms = idx('NOMBRE DE CHAMBRES');
  const out: AtoutRow[] = [];
  for (let r = 1; r < lines.length; r += 1) {
    const cols = parseCsvLine(lines[r] ?? '');
    if (cols.length < 5) continue;
    const cap = Number(cols[iCap] ?? '');
    const rooms = Number(cols[iRooms] ?? '');
    out.push({
      typology: cols[iTy] ?? '',
      classement: cols[iCl] ?? '',
      name: cols[iName] ?? '',
      address: cols[iAddr] ?? '',
      postalCode: cols[iPC] ?? '',
      commune: cols[iCom] ?? '',
      website: cols[iWeb] ?? '',
      capacity: Number.isFinite(cap) && cap > 0 ? cap : null,
      numberOfRooms: Number.isFinite(rooms) && rooms > 0 ? rooms : null,
    });
  }
  return out;
}

// French postal-code prefix → region. Based on INSEE 2024 official mapping.
const POSTAL_TO_REGION: Record<string, string> = {
  // Île-de-France
  '75': 'Île-de-France',
  '77': 'Île-de-France',
  '78': 'Île-de-France',
  '91': 'Île-de-France',
  '92': 'Île-de-France',
  '93': 'Île-de-France',
  '94': 'Île-de-France',
  '95': 'Île-de-France',
  // PACA
  '04': "Provence-Alpes-Côte d'Azur",
  '05': "Provence-Alpes-Côte d'Azur",
  '06': "Provence-Alpes-Côte d'Azur",
  '13': "Provence-Alpes-Côte d'Azur",
  '83': "Provence-Alpes-Côte d'Azur",
  '84': "Provence-Alpes-Côte d'Azur",
  // ARA
  '01': 'Auvergne-Rhône-Alpes',
  '03': 'Auvergne-Rhône-Alpes',
  '07': 'Auvergne-Rhône-Alpes',
  '15': 'Auvergne-Rhône-Alpes',
  '26': 'Auvergne-Rhône-Alpes',
  '38': 'Auvergne-Rhône-Alpes',
  '42': 'Auvergne-Rhône-Alpes',
  '43': 'Auvergne-Rhône-Alpes',
  '63': 'Auvergne-Rhône-Alpes',
  '69': 'Auvergne-Rhône-Alpes',
  '73': 'Auvergne-Rhône-Alpes',
  '74': 'Auvergne-Rhône-Alpes',
  // Nouvelle-Aquitaine
  '16': 'Nouvelle-Aquitaine',
  '17': 'Nouvelle-Aquitaine',
  '19': 'Nouvelle-Aquitaine',
  '23': 'Nouvelle-Aquitaine',
  '24': 'Nouvelle-Aquitaine',
  '33': 'Nouvelle-Aquitaine',
  '40': 'Nouvelle-Aquitaine',
  '47': 'Nouvelle-Aquitaine',
  '64': 'Nouvelle-Aquitaine',
  '79': 'Nouvelle-Aquitaine',
  '86': 'Nouvelle-Aquitaine',
  '87': 'Nouvelle-Aquitaine',
  // Occitanie
  '09': 'Occitanie',
  '11': 'Occitanie',
  '12': 'Occitanie',
  '30': 'Occitanie',
  '31': 'Occitanie',
  '32': 'Occitanie',
  '34': 'Occitanie',
  '46': 'Occitanie',
  '48': 'Occitanie',
  '65': 'Occitanie',
  '66': 'Occitanie',
  '81': 'Occitanie',
  '82': 'Occitanie',
  // Bretagne
  '22': 'Bretagne',
  '29': 'Bretagne',
  '35': 'Bretagne',
  '56': 'Bretagne',
  // Pays-de-la-Loire
  '44': 'Pays de la Loire',
  '49': 'Pays de la Loire',
  '53': 'Pays de la Loire',
  '72': 'Pays de la Loire',
  '85': 'Pays de la Loire',
  // Normandie
  '14': 'Normandie',
  '27': 'Normandie',
  '50': 'Normandie',
  '61': 'Normandie',
  '76': 'Normandie',
  // Hauts-de-France
  '02': 'Hauts-de-France',
  '59': 'Hauts-de-France',
  '60': 'Hauts-de-France',
  '62': 'Hauts-de-France',
  '80': 'Hauts-de-France',
  // Grand Est
  '08': 'Grand Est',
  '10': 'Grand Est',
  '51': 'Grand Est',
  '52': 'Grand Est',
  '54': 'Grand Est',
  '55': 'Grand Est',
  '57': 'Grand Est',
  '67': 'Grand Est',
  '68': 'Grand Est',
  '88': 'Grand Est',
  // Bourgogne-Franche-Comté
  '21': 'Bourgogne-Franche-Comté',
  '25': 'Bourgogne-Franche-Comté',
  '39': 'Bourgogne-Franche-Comté',
  '58': 'Bourgogne-Franche-Comté',
  '70': 'Bourgogne-Franche-Comté',
  '71': 'Bourgogne-Franche-Comté',
  '89': 'Bourgogne-Franche-Comté',
  '90': 'Bourgogne-Franche-Comté',
  // Centre-Val de Loire
  '18': 'Centre-Val de Loire',
  '28': 'Centre-Val de Loire',
  '36': 'Centre-Val de Loire',
  '37': 'Centre-Val de Loire',
  '41': 'Centre-Val de Loire',
  '45': 'Centre-Val de Loire',
  // Corse
  '20': 'Corse',
  '2A': 'Corse',
  '2B': 'Corse',
};

const UNDER_REPRESENTED = new Set([
  'Bretagne',
  'Normandie',
  'Occitanie',
  'Pays de la Loire',
  'Grand Est',
  'Hauts-de-France',
  'Bourgogne-Franche-Comté',
  'Centre-Val de Loire',
  'Corse',
  'Nouvelle-Aquitaine',
]);

function postalToRegion(postalCode: string): string | null {
  const trimmed = postalCode.trim();
  if (trimmed.length < 2) return null;
  const prefix = trimmed.slice(0, 2);
  return POSTAL_TO_REGION[prefix] ?? null;
}

function postalToDepartment(postalCode: string): string | null {
  const trimmed = postalCode.trim();
  if (trimmed.length < 2) return null;
  return trimmed.slice(0, 2);
}

function normalizeCommune(commune: string): string {
  // The CSV has e.g. "PARIS 8E ARRONDISSEMENT" → "Paris 8e".
  // Strip "ARRONDISSEMENT", normalise capitalisation.
  const cleaned = commune
    .replace(/\s+ARRONDISSEMENT\s*/giu, '')
    .replace(/\s+/gu, ' ')
    .trim();
  return cleaned
    .toLowerCase()
    .split(/\s+/u)
    .map((w) => (w.length > 0 ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ')
    .replace(/(\d+)e?$/iu, (_m, n) => `${n}e`);
}

function normalizeName(name: string): string {
  // Atout France ships ALL CAPS — bring it back to title case.
  return name
    .toLowerCase()
    .split(/\s+/u)
    .map((w) => {
      if (w.length === 0) return w;
      // Keep small words like "de", "du", "la", "le", "des", "et", "à" lower
      // (except as the first word — handled at the join).
      const small = new Set(['de', 'du', 'la', 'le', 'les', 'des', 'et', 'à', 'aux', 'd', "d'"]);
      if (small.has(w)) return w;
      return w[0]!.toUpperCase() + w.slice(1);
    })
    .join(' ')
    .replace(/^./u, (c) => c.toUpperCase())
    .trim();
}

function normalizeOfficialUrl(raw: string): string | null {
  // DB CHECK constraint requires `^https?://`. The CSV ships URLs in
  // various flavours: with/without scheme, with/without `www.`,
  // sometimes with trailing punctuation or wrapped in quotes.
  let url = raw.trim().replace(/^["']|["']$/gu, '');
  if (url.length === 0) return null;
  if (!/^https?:\/\//iu.test(url)) {
    if (/^[a-z0-9.-]+\.[a-z]{2,}/iu.test(url)) {
      url = `https://${url}`;
    } else {
      return null;
    }
  }
  // Sanity check — if it still doesn't match the constraint, drop it.
  if (!/^https?:\/\//iu.test(url)) return null;
  if (url.length > 1024) return null;
  return url;
}

function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/['']/gu, '')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 80);
}

interface PreparedRow {
  readonly slug: string;
  readonly name: string;
  readonly stars: 5;
  readonly isPalace: false;
  readonly region: string;
  readonly department: string | null;
  readonly city: string;
  readonly address: string;
  readonly postalCode: string;
  readonly officialUrl: string | null;
  readonly numberOfRooms: number | null;
  readonly descriptionFr: string;
  readonly descriptionEn: string;
  readonly metaTitleFr: string;
  readonly metaDescFr: string;
}

function buildDescription(
  name: string,
  city: string,
  region: string,
): {
  fr: string;
  en: string;
} {
  const fr = `${name} est un hôtel 5 étoiles situé à ${city} (${region}). Établissement classé par Atout France au plus haut standard hôtelier français : confort, service, et exigence de l'accueil. Fiche en cours d'enrichissement éditorial.`;
  const en = `${name} is a 5-star hotel located in ${city} (${region}). Atout France-classified at the highest French hospitality standard. Editorial fiche under enrichment.`;
  return { fr, en };
}

function prepareRows(
  rows: readonly AtoutRow[],
  existingSlugs: ReadonlySet<string>,
  existingNames: ReadonlySet<string>,
  args: CliArgs,
): readonly PreparedRow[] {
  // Hard filter — only proper hotels (no campings, no résidences,
  // no villages vacances, no auberges de jeunesse).
  const fiveStars = rows.filter(
    (r) => r.classement === '5 étoiles' && r.typology === 'HÔTEL DE TOURISME',
  );
  const candidates: PreparedRow[] = [];
  for (const r of fiveStars) {
    const region = postalToRegion(r.postalCode);
    if (region === null) continue;
    const city = normalizeCommune(r.commune);
    const name = normalizeName(r.name);
    const slug = slugify(name);
    if (slug.length < 4) continue;
    if (existingSlugs.has(slug)) continue;
    if (existingNames.has(name.toLowerCase())) continue;
    candidates.push({
      slug,
      name,
      stars: 5,
      isPalace: false,
      region,
      department: postalToDepartment(r.postalCode),
      city,
      address: r.address,
      postalCode: r.postalCode,
      officialUrl: normalizeOfficialUrl(r.website),
      numberOfRooms: r.numberOfRooms,
      ...((): { descriptionFr: string; descriptionEn: string } => {
        const d = buildDescription(name, city, region);
        return { descriptionFr: d.fr, descriptionEn: d.en };
      })(),
      metaTitleFr: `${name} — Hôtel 5 étoiles ${city} | ConciergeTravel`,
      metaDescFr:
        `${name}, hôtel 5 étoiles à ${city}. Classement Atout France. Toutes les informations pratiques, photos et contact.`.slice(
          0,
          160,
        ),
    });
  }

  // Diversification: prioritise under-represented regions, then sort
  // by region (alphabetical) and apply per-city cap.
  candidates.sort((a, b) => {
    const aBoost = UNDER_REPRESENTED.has(a.region) ? 0 : 1;
    const bBoost = UNDER_REPRESENTED.has(b.region) ? 0 : 1;
    if (aBoost !== bBoost) return aBoost - bBoost;
    if (a.region !== b.region) return a.region.localeCompare(b.region);
    if (a.city !== b.city) return a.city.localeCompare(b.city);
    return a.name.localeCompare(b.name);
  });

  // Per-city cap.
  const perCityCount = new Map<string, number>();
  const out: PreparedRow[] = [];
  for (const c of candidates) {
    const key = `${c.region}/${c.city}`;
    const n = perCityCount.get(key) ?? 0;
    if (n >= args.perCity) continue;
    perCityCount.set(key, n + 1);
    out.push(c);
    if (out.length >= args.max) break;
  }
  return out;
}

function escapeSqlLiteral(s: string): string {
  return s.replace(/'/gu, "''");
}

function rowToInsertSql(r: PreparedRow): string {
  const values: string[] = [
    `'${escapeSqlLiteral(r.slug)}'`, // slug
    `'${escapeSqlLiteral(r.name)}'`, // name
    `${r.stars}`, // stars
    `${r.isPalace}`, // is_palace
    `'${escapeSqlLiteral(r.region)}'`, // region
    r.department === null ? 'NULL' : `'${escapeSqlLiteral(r.department)}'`, // department
    `'${escapeSqlLiteral(r.city)}'`, // city
    r.address.length === 0 ? 'NULL' : `'${escapeSqlLiteral(r.address)}'`, // address
    r.postalCode.length === 0 ? 'NULL' : `'${escapeSqlLiteral(r.postalCode)}'`, // postal_code
    r.officialUrl === null ? 'NULL' : `'${escapeSqlLiteral(r.officialUrl)}'`, // official_url
    r.numberOfRooms === null ? 'NULL' : `${r.numberOfRooms}`, // number_of_rooms
    `'${escapeSqlLiteral(r.descriptionFr)}'`, // description_fr
    `'${escapeSqlLiteral(r.descriptionEn)}'`, // description_en
    `'${escapeSqlLiteral(r.metaTitleFr)}'`, // meta_title_fr
    `'${escapeSqlLiteral(r.metaDescFr)}'`, // meta_desc_fr
    `'display_only'`, // booking_mode
    `'P2'`, // priority
    `TRUE`, // is_published
  ];
  return `(${values.join(', ')})`;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const csvPath = path.resolve(__dirname, '../../data/atout-france-raw.csv');
  console.log(`Loading ${csvPath}…`);
  const rows = await loadCsv(csvPath);
  const fiveStars = rows.filter((r) => r.classement === '5 étoiles');
  console.log(`Total CSV rows: ${rows.length}, of which ${fiveStars.length} are 5★.`);

  // Fetch existing slugs + names to avoid duplicates.
  const pgMod = (await import('pg')) as typeof import('pg');
  const conn = process.env['SUPABASE_DB_POOLER_URL'] ?? process.env['SUPABASE_DB_URL'] ?? '';
  if (conn === '') {
    throw new Error('SUPABASE_DB_POOLER_URL or SUPABASE_DB_URL must be set in .env.local');
  }
  const client = new pgMod.Client({
    connectionString: conn.replace(/[?&]sslmode=[^&]*/giu, ''),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  let existingSlugs: ReadonlySet<string>;
  let existingNames: ReadonlySet<string>;
  try {
    const r = await client.query('SELECT slug, name FROM public.hotels');
    existingSlugs = new Set(r.rows.map((x) => String(x.slug).toLowerCase()));
    existingNames = new Set(r.rows.map((x) => String(x.name).toLowerCase()));
  } finally {
    await client.end();
  }
  console.log(`Existing in DB: ${existingSlugs.size} hotels.`);

  const prepared = prepareRows(fiveStars, existingSlugs, existingNames, args);
  console.log(
    `Selected ${prepared.length} new 5★ to insert (max=${args.max}, per-city=${args.perCity}).`,
  );

  // Region breakdown.
  const byRegion = new Map<string, number>();
  for (const p of prepared) byRegion.set(p.region, (byRegion.get(p.region) ?? 0) + 1);
  console.log('Region breakdown:');
  for (const [r, n] of [...byRegion.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  - ${r}: ${n}`);
  }

  if (args.dryRun) {
    console.log('\n--- DRY RUN — sample of first 5 ---');
    for (const p of prepared.slice(0, 5)) {
      console.log(`  ${p.slug} | ${p.name} | ${p.city}, ${p.region}`);
    }
    return;
  }

  // Build a single batched INSERT for atomicity.
  const valuesSql = prepared.map(rowToInsertSql).join(',\n');
  const sql = `
INSERT INTO public.hotels (
  slug, name, stars, is_palace, region, department, city, address, postal_code,
  official_url, number_of_rooms, description_fr, description_en,
  meta_title_fr, meta_desc_fr, booking_mode, priority, is_published
) VALUES
${valuesSql}
ON CONFLICT (slug) DO NOTHING;
`;

  console.log('\nWriting SQL to out/import-5stars.sql…');
  const outPath = path.resolve(__dirname, '../../out/import-5stars.sql');
  const fs = await import('node:fs/promises');
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, sql, 'utf-8');
  console.log(`Wrote ${path.relative(process.cwd(), outPath)} (${sql.length} bytes).`);

  console.log('\nApplying via pg client…');
  const clientApply = new pgMod.Client({
    connectionString: conn.replace(/[?&]sslmode=[^&]*/giu, ''),
    ssl: { rejectUnauthorized: false },
  });
  await clientApply.connect();
  try {
    const result = await clientApply.query(sql);
    console.log(`Inserted ${result.rowCount ?? 0} rows.`);
  } finally {
    await clientApply.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
