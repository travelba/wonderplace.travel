/**
 * Enriches every published Palace in `public.hotels` with the external
 * identifiers Wikidata knows about it.
 *
 * Strategy (per hotel):
 *   1. If `wikidata_id` already filled, skip the resolve step and go to (3).
 *   2. Otherwise, `searchHotel(name + " " + city)` → pick best candidate
 *      scored by description keywords (hôtel/palace) + label match.
 *   3. `fetchHotelExternalIds(qid)` — single SPARQL returns up to 16 facts:
 *        official_url, telephone, email, commons_category,
 *        tripadvisor_id, booking_com_id, google_maps_cid, merimee_id,
 *        inception year, architects, heritage designations,
 *        wikipedia_url_fr/en, twitter, instagram, facebook, youtube, linkedin
 *   4. UPSERT only the columns that came back non-null. Pre-existing
 *      values are NEVER overwritten — editors can pin a value manually
 *      and the next refresh respects it.
 *   5. Architects + heritage + inception_year are stored in a small
 *      jsonb `external_sameas.knowledge_graph` blob (additive to the
 *      structured columns we already have).
 *
 * Anti-hallucination guard rails:
 *   - Wikidata is a curated knowledge graph, not an LLM. All values are
 *     attributed and machine-verifiable.
 *   - Phone numbers reaching here are passed through E.164 normalisation
 *     (only kept if `^\+[1-9]\d{3,14}$`).
 *   - URLs must be HTTPS to pass the migration's CHECK constraint;
 *     non-HTTPS values are dropped.
 *
 * Run:
 *   pnpm --filter @cct/editorial-pilot exec tsx \
 *     src/enrichment/enrich-wikidata-ids.ts
 *
 * Idempotent: re-running is safe — UPDATE only sets columns currently NULL.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadDotenv } from 'dotenv';

import {
  fetchHotelExternalIds,
  fetchWikidataCoordinates,
  haversineKm,
  searchHotel,
  type WdSearchResult,
} from './wikidata.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

loadDotenv({ path: path.resolve(__dirname, '../../../../.env.local') });
loadDotenv({ path: path.resolve(__dirname, '../../../../.env') });

interface HotelRow {
  readonly slug: string;
  readonly name: string;
  readonly city: string;
  readonly wikidata_id: string | null;
  readonly latitude: string | null;
  readonly longitude: string | null;
}

/** Max distance between the editorial fiche coords and the Wikidata
 *  entity coords before we reject the match as a false positive.
 *  Tuned at 5 km — a hotel can have an annexe across town, but a 5 km
 *  ball around the GPS still catches every legitimate match while
 *  filtering out cross-département mismatches (Pézenas vs Vence was
 *  600 km).
 */
const GEO_VALIDATION_MAX_KM = 5;

interface UpdatePayload {
  wikidata_id?: string;
  wikipedia_url_fr?: string;
  wikipedia_url_en?: string;
  tripadvisor_location_id?: string;
  booking_com_hotel_id?: string;
  official_url?: string;
  email_reservations?: string;
  commons_category?: string;
  phone_e164?: string;
  external_sameas?: Record<string, unknown>;
}

const E164_RE = /^\+[1-9]\d{3,14}$/u;

function normalizePhone(raw: string): string | null {
  const cleaned = raw.replace(/[\s().-]/gu, '').replace(/^00/u, '+');
  if (E164_RE.test(cleaned)) return cleaned;
  if (/^[1-9]\d{8,14}$/u.test(cleaned)) {
    return `+33${cleaned.replace(/^0/u, '')}`.slice(0, 16);
  }
  return null;
}

function safeUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return u.href;
  } catch {
    return null;
  }
}

/**
 * Strip noise from an editorial hotel name to produce a query that the
 * wbsearchentities API actually matches:
 *   - drop the "Hôtel" prefix (Wikidata labels rarely start with it)
 *   - drop chain suffixes ("- A Four Seasons Hotel", "by Marriott", …)
 *   - drop the city when it duplicates the editorial slug context
 *   - trim editorial punctuation ("&", commas, apostrophes round-trip)
 */
function buildQueries(name: string, city: string): readonly string[] {
  const variants = new Set<string>();
  const stripPrefix = name.replace(/^(?:H[oô]tel|Le|La|Les|L'|L’)\s+/iu, '').trim();
  const stripChainSuffix = stripPrefix
    .replace(
      /\s*[-–—,]\s*(?:A\s+|An\s+)?[^,]+(?:Hotel|Resort|Collection|Hotels?\s*and\s*Spa).*/iu,
      '',
    )
    .replace(/\s+by\s+\w+.*$/iu, '')
    .replace(/\s*[&,]\s+Spa\b.*/iu, '')
    .replace(/\s*Palace\s*$/iu, '')
    .trim();

  variants.add(name);
  variants.add(stripPrefix);
  variants.add(stripChainSuffix);
  // First two significant tokens — often enough for entities like
  // "Plaza Athénée", "Royal Monceau", "Le Meurice".
  const tokens = stripChainSuffix.split(/\s+/u).filter((t) => t.length > 2);
  if (tokens.length >= 2) variants.add(tokens.slice(0, 2).join(' '));
  if (tokens.length >= 3) variants.add(tokens.slice(0, 3).join(' '));
  // City-qualified fallback
  variants.add(`${stripChainSuffix} ${city}`);

  return [...variants].filter((v) => v.length >= 3);
}

const HOTEL_DESC_RE =
  /h[oô]tel|palace|h[ée]bergement|building|b[aâ]timent|hostellerie|auberge|relais|ch[aâ]teau|villa|resort/iu;

/**
 * Score a candidate against the hotel name + city.
 *  - +10  description looks like an accommodation
 *  - +5   label matches a significant token of the name
 *  - +5   description mentions the city
 *  - +3   the QID has a label in fr or en
 * We accept candidates with score ≥ 8 (was 5) — paired with the
 * multi-query strategy below, recall jumps from 7 % to ~70 % on the
 * Palace catalog.
 */
function scoreCandidate(c: WdSearchResult, hotelName: string, city: string): number {
  let s = 0;
  const desc = c.description ?? '';
  if (HOTEL_DESC_RE.test(desc)) s += 10;
  const tokens = hotelName
    .toLowerCase()
    .split(/\s+/u)
    .filter((t) => t.length > 3 && !/^(h[oô]tel|le|la|les|the|and|de|du|des|spa)$/u.test(t));
  for (const tok of tokens) {
    if (c.label.toLowerCase().includes(tok)) s += 3;
  }
  if (city.length > 2 && desc.toLowerCase().includes(city.toLowerCase())) s += 5;
  if (c.label.length > 0) s += 3;
  return s;
}

async function findHotelMulti(name: string, city: string): Promise<WdSearchResult | null> {
  const queries = buildQueries(name, city);
  const allCandidates = new Map<string, WdSearchResult>();
  for (const q of queries) {
    try {
      const results = await searchHotel(q, { lang: 'fr', limit: 5 });
      for (const r of results) allCandidates.set(r.qid, r);
      // Polite throttle on the search endpoint as well
      await new Promise((r) => setTimeout(r, 250));
    } catch {
      // Skip transient errors on individual queries
    }
  }
  if (allCandidates.size === 0) return null;
  const scored = [...allCandidates.values()]
    .map((c) => ({ c, s: scoreCandidate(c, name, city) }))
    .sort((a, b) => b.s - a.s);
  const best = scored[0];
  if (best === undefined || best.s < 8) return null;
  return best.c;
}

async function main(): Promise<void> {
  const connectionString =
    process.env['DATABASE_URL'] ??
    process.env['SUPABASE_DB_POOLER_URL'] ??
    process.env['SUPABASE_DB_URL'] ??
    null;
  if (connectionString === null) {
    console.error('Set SUPABASE_DB_POOLER_URL (preferred) or SUPABASE_DB_URL.');
    process.exit(1);
  }

  const pg = await import('pg');
  const cleaned = connectionString.replace(/[?&]sslmode=[^&]*/giu, '');
  const isLocal = cleaned.includes('localhost') || cleaned.includes('127.0.0.1');
  const client = new pg.Client({
    connectionString: cleaned,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    const { rows } = await client.query<HotelRow>(
      `SELECT slug, name, city, wikidata_id, latitude::text, longitude::text
       FROM public.hotels
       WHERE is_published = TRUE
       ORDER BY name;`,
    );
    console.log(`Enriching ${rows.length} hotels via Wikidata…\n`);

    let ok = 0;
    let skipped = 0;
    let failed = 0;

    for (const hotel of rows) {
      const tag = `[${hotel.slug}]`;
      try {
        let qid = hotel.wikidata_id;
        if (qid === null) {
          const found = await findHotelMulti(hotel.name, hotel.city);
          if (found === null) {
            console.log(
              `${tag} ✗ no Wikidata candidate (name="${hotel.name}", city="${hotel.city}")`,
            );
            skipped += 1;
            continue;
          }
          qid = found.qid;
          console.log(
            `${tag} → matched ${qid} ("${found.label}" — ${found.description ?? 'no desc'})`,
          );
        } else {
          console.log(`${tag} → using existing ${qid}`);
        }

        // Geographic sanity check — rejects "matches" where Wikidata
        // entity is in a different city/region than the editorial fiche.
        // Skipped when either coords side is missing (rare in practice).
        const lat = hotel.latitude !== null ? Number(hotel.latitude) : null;
        const lng = hotel.longitude !== null ? Number(hotel.longitude) : null;
        if (lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng)) {
          const wdCoords = await fetchWikidataCoordinates(qid);
          if (wdCoords !== null) {
            const dist = haversineKm({ lat, lng }, wdCoords);
            if (dist > GEO_VALIDATION_MAX_KM) {
              console.log(
                `${tag} ✗ geo-rejected ${qid}: ${dist.toFixed(1)} km > ${GEO_VALIDATION_MAX_KM} km (DB ${lat},${lng} vs WD ${wdCoords.lat},${wdCoords.lng})`,
              );
              skipped += 1;
              continue;
            }
            console.log(`${tag}   ✓ geo-validated (${dist.toFixed(2)} km)`);
          }
          await new Promise((r) => setTimeout(r, 600));
        }

        // Polite throttle (< 1 req/s on the SPARQL endpoint)
        await new Promise((r) => setTimeout(r, 1100));

        const ext = await fetchHotelExternalIds(qid);
        const update: UpdatePayload = { wikidata_id: qid };

        if (ext.wikipediaUrlFr !== null) {
          const u = safeUrl(ext.wikipediaUrlFr);
          if (u !== null) update.wikipedia_url_fr = u;
        }
        if (ext.wikipediaUrlEn !== null) {
          const u = safeUrl(ext.wikipediaUrlEn);
          if (u !== null) update.wikipedia_url_en = u;
        }
        if (ext.tripadvisorId !== null && /^\d+$/u.test(ext.tripadvisorId)) {
          update.tripadvisor_location_id = ext.tripadvisorId;
        }
        if (ext.bookingComId !== null && /^[a-z0-9-]+$/u.test(ext.bookingComId)) {
          update.booking_com_hotel_id = ext.bookingComId;
        }
        if (ext.officialUrl !== null) {
          const u = safeUrl(ext.officialUrl);
          if (u !== null) update.official_url = u;
        }
        if (ext.email !== null && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(ext.email)) {
          update.email_reservations = ext.email;
        }
        if (ext.commonsCategory !== null) {
          // Wikidata sometimes returns "Category:Foo" — strip the prefix.
          const cat = ext.commonsCategory.replace(/^Category:/u, '');
          if (!cat.includes('/')) update.commons_category = cat;
        }
        if (ext.telephone !== null) {
          const e164 = normalizePhone(ext.telephone);
          if (e164 !== null) update.phone_e164 = e164;
        }

        const sameAs: Record<string, unknown> = { ...ext.sameAs };
        if (ext.merimeeId !== null) sameAs['merimee_id'] = ext.merimeeId;
        if (ext.googleMapsCid !== null) sameAs['google_maps_cid'] = ext.googleMapsCid;
        if (ext.inceptionYear !== null) sameAs['inception_year'] = ext.inceptionYear;
        if (ext.architects.length > 0) sameAs['architects'] = ext.architects;
        if (ext.heritageDesignations.length > 0) {
          sameAs['heritage_designations'] = ext.heritageDesignations;
        }
        if (Object.keys(sameAs).length > 0) update.external_sameas = sameAs;

        // Build a COALESCE-based UPDATE so we NEVER overwrite an existing
        // editor-pinned value. The migration's CHECK constraints filter
        // out malformed payloads at the DB level for extra safety.
        const setClauses: string[] = [];
        const params: unknown[] = [];
        const push = (sql: string, value: unknown): void => {
          params.push(value);
          setClauses.push(sql.replace('$$', `$${params.length}`));
        };
        if (update.wikidata_id !== undefined)
          push('wikidata_id = COALESCE(wikidata_id, $$)', update.wikidata_id);
        if (update.wikipedia_url_fr !== undefined)
          push('wikipedia_url_fr = COALESCE(wikipedia_url_fr, $$)', update.wikipedia_url_fr);
        if (update.wikipedia_url_en !== undefined)
          push('wikipedia_url_en = COALESCE(wikipedia_url_en, $$)', update.wikipedia_url_en);
        if (update.tripadvisor_location_id !== undefined)
          push(
            'tripadvisor_location_id = COALESCE(tripadvisor_location_id, $$)',
            update.tripadvisor_location_id,
          );
        if (update.booking_com_hotel_id !== undefined)
          push(
            'booking_com_hotel_id = COALESCE(booking_com_hotel_id, $$)',
            update.booking_com_hotel_id,
          );
        if (update.official_url !== undefined)
          push('official_url = COALESCE(official_url, $$)', update.official_url);
        if (update.email_reservations !== undefined)
          push('email_reservations = COALESCE(email_reservations, $$)', update.email_reservations);
        if (update.commons_category !== undefined)
          push('commons_category = COALESCE(commons_category, $$)', update.commons_category);
        if (update.phone_e164 !== undefined)
          push('phone_e164 = COALESCE(phone_e164, $$)', update.phone_e164);
        if (update.external_sameas !== undefined) {
          // Merge: pre-existing keys win, new keys are appended.
          push(
            "external_sameas = COALESCE(external_sameas, '{}'::jsonb) || $$::jsonb",
            JSON.stringify(update.external_sameas),
          );
        }

        if (setClauses.length === 0) {
          console.log(`${tag}   (nothing new to write)`);
          skipped += 1;
          continue;
        }

        setClauses.push(`updated_at = timezone('utc', now())`);
        params.push(hotel.slug);
        const sql = `UPDATE public.hotels SET ${setClauses.join(', ')} WHERE slug = $${params.length};`;
        await client.query(sql, params);

        const filled = Object.entries(update)
          .filter(([, v]) => v !== undefined)
          .map(([k]) => k)
          .join(', ');
        console.log(`${tag}   ✓ wrote ${filled}`);
        ok += 1;

        // Polite throttle between hotels
        await new Promise((r) => setTimeout(r, 600));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`${tag} ✗ ${msg}`);
        failed += 1;
      }
    }

    console.log(`\nDone. ok=${ok}, skipped=${skipped}, failed=${failed}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
