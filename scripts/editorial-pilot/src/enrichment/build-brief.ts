/**
 * CLI: build an auto-generated brief for one hotel from DATAtourisme.
 *
 * Usage:
 *   pnpm exec tsx src/enrichment/build-brief.ts <slug> --query "<search query>" [--dept <insee>]
 *   pnpm exec tsx src/enrichment/build-brief.ts <slug> --uuid <datatourisme-uuid>
 *
 * Examples:
 *   pnpm exec tsx src/enrichment/build-brief.ts plaza-athenee-paris --query "Plaza Athénée" --dept 75
 *   pnpm exec tsx src/enrichment/build-brief.ts plaza-athenee-paris --uuid 849823a2-e1fa-30de-b545-588efa83ace5
 *
 * Output:
 *   briefs-auto/<slug>.json  (BriefSchema-valid)
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  findHotelByName,
  fetchHotelByUuid,
  fetchPOIsAround,
  listHotelsInDepartment,
  type DtHotel,
} from './datatourisme.js';
import { fetchHotelByQid, searchHotel, type WdHotel } from './wikidata.js';
import { fetchSummaryWithFallbacks, type WpSummary } from './wikipedia.js';
import { buildBriefFromSources, hotelCoreFromDt, type HotelCore } from './brief-builder.js';
import { extractDining, type DiningExtractionResult } from './dining-extractor.js';
import { extractCapacity, type CapacityExtractionResult } from './capacity-extractor.js';
import { extractWellness, type WellnessExtractionResult } from './wellness-extractor.js';
import { extractServices, type ServicesExtractionResult } from './services-extractor.js';

interface CliArgs {
  readonly slug: string;
  readonly query: string | null;
  readonly departmentInsee: string | null;
  readonly uuid: string | null;
  readonly wikidataQid: string | null;
  readonly wikipediaTitle: string | null;
  readonly radius: number;
  readonly skipEnrichment: boolean;
  readonly skipTavily: boolean;
  readonly officialDomainOverride: string | null;
  /**
   * Force `classification.atout_france_palace = true` in the built brief.
   * Required for Palaces not flagged in DATAtourisme (most hotels outside
   * Paris, even though they hold the official Atout France distinction).
   */
  readonly forcePalace: boolean;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const out: {
    slug: string | null;
    query: string | null;
    departmentInsee: string | null;
    uuid: string | null;
    wikidataQid: string | null;
    wikipediaTitle: string | null;
    radius: number;
    skipEnrichment: boolean;
    skipTavily: boolean;
    officialDomainOverride: string | null;
    forcePalace: boolean;
  } = {
    slug: null,
    query: null,
    departmentInsee: null,
    uuid: null,
    wikidataQid: null,
    wikipediaTitle: null,
    radius: 800,
    skipEnrichment: false,
    skipTavily: false,
    officialDomainOverride: null,
    forcePalace: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok === undefined) continue;
    if (tok === '--query') {
      out.query = argv[++i] ?? null;
    } else if (tok === '--dept') {
      out.departmentInsee = argv[++i] ?? null;
    } else if (tok === '--uuid') {
      out.uuid = argv[++i] ?? null;
    } else if (tok === '--qid') {
      out.wikidataQid = argv[++i] ?? null;
    } else if (tok === '--wp') {
      out.wikipediaTitle = argv[++i] ?? null;
    } else if (tok === '--radius') {
      out.radius = Number(argv[++i] ?? 800);
    } else if (tok === '--no-enrich') {
      out.skipEnrichment = true;
    } else if (tok === '--no-tavily') {
      out.skipTavily = true;
    } else if (tok === '--domain') {
      out.officialDomainOverride = argv[++i] ?? null;
    } else if (tok === '--force-palace') {
      out.forcePalace = true;
    } else if (!out.slug && !tok.startsWith('--')) {
      out.slug = tok;
    }
  }
  if (!out.slug) {
    throw new Error('Missing required <slug> argument.');
  }
  if (!out.query && !out.uuid) {
    throw new Error('Provide either --query "<name>" or --uuid <datatourisme-uuid>.');
  }
  return {
    slug: out.slug,
    query: out.query,
    departmentInsee: out.departmentInsee,
    uuid: out.uuid,
    wikidataQid: out.wikidataQid,
    wikipediaTitle: out.wikipediaTitle,
    radius: out.radius,
    skipEnrichment: out.skipEnrichment,
    skipTavily: out.skipTavily,
    officialDomainOverride: out.officialDomainOverride,
    forcePalace: out.forcePalace,
  };
}

const NAME_STOPWORDS = new Set([
  // Articles, prepositions, conjunctions (FR + EN)
  'le',
  'la',
  'les',
  'l',
  'un',
  'une',
  'des',
  'du',
  'de',
  'd',
  'a',
  'à',
  'au',
  'aux',
  'et',
  'ou',
  'and',
  'or',
  'in',
  'on',
  'at',
  // Generic hotel-vocabulary words too common to discriminate
  'hôtel',
  'hotel',
  'spa',
  'palace',
  'resort',
  'paris',
]);

function normalizeForMatching(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[''`’]/gu, '');
}

/**
 * Fraction of discriminant query tokens found in `candidateName`.
 * Discriminant = length ≥ 2, not a stopword. Keeps tokens like `k2`,
 * `coste`, `messardiere`. Two-char generic articles are filtered by the
 * stopword list, not by length.
 */
function computeNameMatchRatio(query: string, candidateName: string): number {
  const tokens = normalizeForMatching(query)
    .split(/[^a-z0-9]+/u)
    .filter((t) => t.length >= 2 && !NAME_STOPWORDS.has(t));
  if (tokens.length === 0) return 1;
  const haystack = normalizeForMatching(candidateName);
  const matched = tokens.filter((t) => haystack.includes(t)).length;
  return matched / tokens.length;
}

function extractOfficialDomain(websiteUrl: string | null): string | null {
  if (!websiteUrl) return null;
  try {
    return new URL(websiteUrl).hostname.replace(/^www\./u, '');
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  console.log(
    `\n[build-brief] slug=${args.slug} query="${args.query ?? '-'}" uuid=${args.uuid ?? '-'} dept=${args.departmentInsee ?? '-'}`,
  );

  let uuid = args.uuid;
  if (!uuid && args.query) {
    console.log(`[build-brief] searching DATAtourisme for "${args.query}"…`);
    const searchOpts: { departmentInsee?: string; limit?: number } = { limit: 5 };
    if (args.departmentInsee) searchOpts.departmentInsee = args.departmentInsee;

    // Strategy:
    //  1) Try fast keyword search via `findHotelByName`.
    //  2) If the top candidate's name fails the >=50% token match check,
    //     fall back to crawling the entire department catalog with
    //     `listHotelsInDepartment` and matching client-side. This rescues
    //     hotels that DATAtourisme indexes but whose names contain tokens
    //     its search engine ranks poorly (e.g. Cap-Ferrat, La Réserve).
    //  3) If nothing matches >=50% even from the department crawl, abort.
    // Stringent threshold: we require ≥80% of discriminant tokens to match.
    // This rejects look-alikes such as "Hôtel Blanche Neige Univac Courchevel"
    // when the user is looking for "Cheval Blanc Courchevel" (token "cheval"
    // missing). Better fail loud than build a brief on the wrong hotel.
    const MIN_MATCH_RATIO = 0.8;
    let best: DtHotel | null = null;
    let matchRatio = 0;
    const candidates = await findHotelByName(args.query, searchOpts);
    if (candidates.length > 0) {
      console.log(`[build-brief] keyword search returned ${candidates.length} candidate(s):`);
      candidates.forEach((c, idx) => {
        console.log(
          `  [${idx}] ${c.name} — ${c.location.postalCode} ${c.location.city} — palace=${c.classification.isPalace} — stars=${c.classification.stars ?? '?'} — uuid=${c.uuid}`,
        );
      });
      const top = candidates[0] ?? null;
      if (top) {
        const ratio = computeNameMatchRatio(args.query, top.name);
        if (ratio >= MIN_MATCH_RATIO) {
          best = top;
          matchRatio = ratio;
        }
      }
    }

    if (!best && args.departmentInsee) {
      console.log(
        `[build-brief] keyword search insufficient — crawling all hotels in dept ${args.departmentInsee}…`,
      );
      const all = await listHotelsInDepartment(args.departmentInsee, { pageSize: 250 });
      console.log(`  ${all.length} hotel(s) in department.`);
      const ranked = all
        .map((h) => ({ h, ratio: computeNameMatchRatio(args.query!, h.name) }))
        .filter((r) => r.ratio >= MIN_MATCH_RATIO)
        .sort((a, b) => b.ratio - a.ratio);
      if (ranked.length > 0) {
        console.log(
          `  ${ranked.length} candidate(s) ≥ ${(MIN_MATCH_RATIO * 100).toFixed(0)}% match:`,
        );
        ranked.slice(0, 5).forEach((r, idx) => {
          console.log(
            `    [${idx}] ${r.h.name} — ${r.h.location.postalCode} ${r.h.location.city} — ratio=${(r.ratio * 100).toFixed(0)}%`,
          );
        });
        const top = ranked[0];
        if (top) {
          best = top.h;
          matchRatio = top.ratio;
        }
      }
    }

    if (!best) {
      throw new Error(
        `No DATAtourisme hotel match ≥${(MIN_MATCH_RATIO * 100).toFixed(0)}% for "${args.query}" (dept ${args.departmentInsee ?? 'none'}). The hotel is likely absent from DATAtourisme — provide --uuid <id>, refine --query, or create a manual brief.`,
      );
    }
    uuid = best.uuid;
    console.log(
      `[build-brief] selected: ${best.name} (${uuid}, name-match=${(matchRatio * 100).toFixed(0)}%)`,
    );
  }

  if (!uuid) throw new Error('No UUID resolved.');

  console.log(`\n[build-brief] fetching full hotel detail uuid=${uuid}…`);
  const hotel = await fetchHotelByUuid(uuid);
  console.log(`  name=${hotel.name}`);
  console.log(
    `  address=${hotel.location.streetAddress}, ${hotel.location.postalCode} ${hotel.location.city}`,
  );
  console.log(`  gps=(${hotel.location.latitude}, ${hotel.location.longitude})`);
  console.log(
    `  classification: palace=${hotel.classification.isPalace} stars=${hotel.classification.stars}`,
  );
  console.log(
    `  contact: website=${hotel.contact.website ?? '✗'} phone=${hotel.contact.phone ?? '✗'}`,
  );
  console.log(
    `  description: ${hotel.descriptionShort ? `${hotel.descriptionShort.length} chars` : '✗ missing'}`,
  );

  console.log(`\n[build-brief] fetching POIs within ${args.radius}m…`);
  const pois = await fetchPOIsAround(hotel.location.latitude, hotel.location.longitude, {
    radiusMeters: args.radius,
    excludeUuid: hotel.uuid,
    limit: 50,
  });
  console.log(`  ${pois.length} curated POI(s):`);
  pois.forEach((p) => console.log(`    - [${p.category}] ${p.name} @ ${p.distanceMeters}m`));

  let wikidata: WdHotel | null = null;
  let wikipedia: WpSummary | null = null;
  let diningRes: DiningExtractionResult | null = null;
  let capacityRes: CapacityExtractionResult | null = null;
  let wellnessRes: WellnessExtractionResult | null = null;
  let servicesRes: ServicesExtractionResult | null = null;

  const officialDomain =
    args.officialDomainOverride ?? extractOfficialDomain(hotel.contact.website);

  if (!args.skipEnrichment) {
    console.log(`\n[build-brief] enriching from Wikidata + Wikipedia + Tavily…`);
    console.log(`  official domain (Tavily target): ${officialDomain ?? '✗ none'}`);

    const [wdSettled, wpSettled, diningSettled, capacitySettled, wellnessSettled, servicesSettled] =
      await Promise.all([
        settle(resolveWikidata(args.wikidataQid, hotel.name)),
        settle(resolveWikipedia(args.wikipediaTitle, hotel.name)),
        args.skipTavily
          ? settle(Promise.resolve<DiningExtractionResult | null>(null))
          : settle(
              extractDining({
                hotelName: hotel.name,
                city: hotel.location.city,
                officialDomain,
              }),
            ),
        args.skipTavily
          ? settle(Promise.resolve<CapacityExtractionResult | null>(null))
          : settle(
              extractCapacity({
                hotelName: hotel.name,
                city: hotel.location.city,
                officialDomain,
                fallbackNarrative: hotel.descriptionLong ?? hotel.descriptionShort ?? null,
              }),
            ),
        args.skipTavily
          ? settle(Promise.resolve<WellnessExtractionResult | null>(null))
          : settle(
              extractWellness({
                hotelName: hotel.name,
                city: hotel.location.city,
                officialDomain,
              }),
            ),
        args.skipTavily
          ? settle(Promise.resolve<ServicesExtractionResult | null>(null))
          : settle(
              extractServices({
                hotelName: hotel.name,
                city: hotel.location.city,
                officialDomain,
              }),
            ),
      ]);

    if (wdSettled.ok) {
      wikidata = wdSettled.value;
      if (wikidata) {
        console.log(
          `  Wikidata ${wikidata.qid}: inception=${wikidata.inception?.year ?? '?'}, architects=${wikidata.architects.length}, owner=${wikidata.owner ?? '✗'}, heritage=${wikidata.heritageDesignations.length}`,
        );
      } else {
        console.log(`  Wikidata: ✗ no confident match`);
      }
    } else {
      console.log(`  Wikidata: ⚠ error — ${wdSettled.error}`);
    }

    if (wpSettled.ok) {
      wikipedia = wpSettled.value;
      console.log(
        wikipedia
          ? `  Wikipedia: ${wikipedia.title} (${wikipedia.extract.length} chars extract)`
          : `  Wikipedia: ✗ no FR article found`,
      );
    } else {
      console.log(`  Wikipedia: ⚠ error — ${wpSettled.error}`);
    }

    if (args.skipTavily) {
      console.log(`  Tavily: skipped (--no-tavily)`);
    } else {
      if (diningSettled.ok) {
        diningRes = diningSettled.value;
        if (diningRes) {
          console.log(
            `  Tavily/dining: ${diningRes.outlets.length} outlet(s) — ${diningRes.searchCount} search + ${diningRes.extractCount} extract calls`,
          );
          for (const o of diningRes.outlets) {
            console.log(
              `    • ${o.name} [${o.type}] — chef=${o.chef ?? '?'} stars=${o.michelinStars ?? '?'} cuisine=${o.cuisine ?? '?'}`,
            );
          }
        }
      } else {
        console.log(`  Tavily/dining: ⚠ error — ${diningSettled.error}`);
      }
      if (capacitySettled.ok) {
        capacityRes = capacitySettled.value;
        if (capacityRes?.capacity) {
          const c = capacityRes.capacity;
          console.log(
            `  Tavily/capacity: total=${c.totalKeys ?? '?'} rooms=${c.roomsCount ?? '?'} suites=${c.suitesCount ?? '?'} surface=${c.minRoomSurfaceM2 ?? '?'}-${c.maxRoomSurfaceM2 ?? '?'} m²`,
          );
        } else {
          console.log(`  Tavily/capacity: ✗ no data extracted`);
        }
      } else {
        console.log(`  Tavily/capacity: ⚠ error — ${capacitySettled.error}`);
      }
      if (wellnessSettled.ok) {
        wellnessRes = wellnessSettled.value;
        if (wellnessRes?.wellness) {
          const w = wellnessRes.wellness;
          console.log(
            `  Tavily/wellness: spa=${w.spaName ?? '?'} brand=${w.partnerBrand ?? '?'} surface=${w.surfaceM2 ?? '?'} pool=${w.hasPool ?? '?'} treatments=${w.signatureTreatments.length}`,
          );
        } else {
          console.log(`  Tavily/wellness: ✗ no data extracted`);
        }
      } else {
        console.log(`  Tavily/wellness: ⚠ error — ${wellnessSettled.error}`);
      }
      if (servicesSettled.ok) {
        servicesRes = servicesSettled.value;
        if (servicesRes?.services) {
          const s = servicesRes.services;
          console.log(
            `  Tavily/services: langs=[${s.languagesSpoken.join(', ') || '?'}] valet=${s.hasValetParking ?? '?'} transfer=${s.hasAirportTransfer ?? '?'} pets=${s.petsAllowed ?? '?'} clefsdor=${s.conciergeClefsDor ?? '?'} 24h=${s.has24hRoomService ?? '?'}`,
          );
        } else {
          console.log(`  Tavily/services: ✗ no data extracted`);
        }
      } else {
        console.log(`  Tavily/services: ⚠ error — ${servicesSettled.error}`);
      }
    }
  } else {
    console.log(`\n[build-brief] enrichment skipped (--no-enrich)`);
  }

  console.log(`\n[build-brief] assembling brief…`);
  const hotelCore: HotelCore = hotelCoreFromDt(hotel);
  const baseBrief = buildBriefFromSources(
    {
      hotel: hotelCore,
      pois,
      wikidata,
      wikipedia,
      diningOutlets: diningRes?.outlets ?? [],
      capacity: capacityRes?.capacity ?? null,
      wellness: wellnessRes?.wellness ?? null,
      services: servicesRes?.services ?? null,
    },
    { slug: args.slug },
  );

  // Force Palace flag for hotels distinguished by Atout France but absent
  // from DATAtourisme's LabelRating_Palace index (almost all hotels outside
  // Paris). The official source remains palace.atout-france.fr.
  const brief = args.forcePalace
    ? {
        ...baseBrief,
        classification: {
          ...baseBrief.classification,
          atout_france_palace: true,
          source:
            'Atout France official Palace registry — https://palace.atout-france.fr (DATAtourisme silent on this attribute outside Paris)',
        },
      }
    : baseBrief;

  if (args.forcePalace) {
    console.log(`  classification.atout_france_palace forced to true (--force-palace)`);
  }

  const outDir = resolve(process.cwd(), 'briefs-auto');
  await mkdir(outDir, { recursive: true });
  const outPath = resolve(outDir, `${args.slug}.json`);
  await writeFile(outPath, JSON.stringify(brief, null, 2), 'utf-8');
  console.log(
    `\n✓ Brief written → briefs-auto/${args.slug}.json (${JSON.stringify(brief).length} bytes)`,
  );
  console.log(`\nNext step: EDITORIAL_PILOT_BRIEFS_DIR=briefs-auto pnpm run run:plaza`);
}

async function resolveWikidata(qid: string | null, hotelName: string): Promise<WdHotel | null> {
  if (qid) return await fetchHotelByQid(qid);
  const results = await searchHotel(hotelName, { lang: 'fr', limit: 5 });
  if (results.length === 0) return null;
  // Pick the first result whose description sounds like a hotel
  const best = results.find(
    (r) => r.description !== null && /h[oô]tel|palace|h[ée]bergement|lodg/iu.test(r.description),
  );
  if (!best) return null;
  return await fetchHotelByQid(best.qid);
}

async function resolveWikipedia(
  title: string | null,
  hotelName: string,
): Promise<WpSummary | null> {
  const candidates: string[] = title ? [title] : [];
  // Build fallbacks: common French Wikipedia title patterns for hotels
  candidates.push(
    hotelName,
    hotelName.replace(/^Hôtel\s+/iu, ''),
    `Hôtel ${hotelName}`,
    `${hotelName.replace(/Paris$/u, '').trim()} (Paris)`,
    `${hotelName.replace(/Paris$/u, '').trim()}`,
  );
  return await fetchSummaryWithFallbacks(
    Array.from(new Set(candidates.filter((c) => c.trim().length > 0))),
    'fr',
  );
}

type Settled<T> = { ok: true; value: T } | { ok: false; error: string };

async function settle<T>(promise: Promise<T>): Promise<Settled<T>> {
  try {
    const value = await promise;
    return { ok: true, value };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

main().catch((err) => {
  console.error(`[build-brief] FAILED: ${(err as Error).message}`);
  if ((err as Error).stack) console.error((err as Error).stack);
  process.exit(1);
});
