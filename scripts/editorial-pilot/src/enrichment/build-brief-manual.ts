/**
 * build-brief-manual.ts — CLI for hotels NOT indexed in DATAtourisme.
 *
 * Many Atout France Palaces outside Paris (e.g. all 5 Courchevel palaces,
 * Château Saint-Martin & Spa Vence, Airelles Gordes, Cheval Blanc
 * St-Barth) are absent from the DATAtourisme catalog. For these we still
 * want to drive the standard 7-pass editorial pipeline, so we assemble a
 * brief from:
 *   - Manual core facts (name, address, GPS) provided on the CLI
 *   - Wikidata (architects, owner, inception year, heritage)
 *   - Wikipedia FR (narrative extract)
 *   - Tavily (dining, capacity, wellness, services)
 *
 * Usage:
 *   pnpm exec tsx src/enrichment/build-brief-manual.ts <slug> \
 *     --name "Cheval Blanc Courchevel" \
 *     --city Courchevel \
 *     --postal 73120 \
 *     --address "Le Jardin Alpin" \
 *     --lat 45.413 --lng 6.629 \
 *     --website https://www.chevalblanc.com/courchevel \
 *     --qid Q3361181        # optional Wikidata QID hint
 *     --wp "Cheval Blanc Courchevel"  # optional Wikipedia FR title hint
 *
 * Output: briefs-auto/<slug>.json (BriefSchema-valid, force_palace=true).
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fetchPOIsAround, type DtPoi } from './datatourisme.js';
import { fetchHotelByQid, searchHotel, type WdHotel } from './wikidata.js';
import { fetchSummaryWithFallbacks, type WpSummary } from './wikipedia.js';
import { buildBriefFromSources, type HotelCore } from './brief-builder.js';
import { extractDining, type DiningExtractionResult } from './dining-extractor.js';
import { extractCapacity, type CapacityExtractionResult } from './capacity-extractor.js';
import { extractWellness, type WellnessExtractionResult } from './wellness-extractor.js';
import { extractServices, type ServicesExtractionResult } from './services-extractor.js';

interface CliArgs {
  readonly slug: string;
  readonly name: string;
  readonly city: string;
  readonly country: string;
  readonly postalCode: string;
  readonly streetAddress: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly website: string | null;
  readonly wikidataQid: string | null;
  readonly wikipediaTitle: string | null;
  readonly radius: number;
  readonly skipTavily: boolean;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const o: {
    slug: string | null;
    name: string | null;
    city: string | null;
    country: string;
    postalCode: string;
    streetAddress: string;
    latitude: number | null;
    longitude: number | null;
    website: string | null;
    wikidataQid: string | null;
    wikipediaTitle: string | null;
    radius: number;
    skipTavily: boolean;
  } = {
    slug: null,
    name: null,
    city: null,
    country: 'FR',
    postalCode: '',
    streetAddress: '',
    latitude: null,
    longitude: null,
    website: null,
    wikidataQid: null,
    wikipediaTitle: null,
    radius: 800,
    skipTavily: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok === undefined) continue;
    if (tok === '--name') o.name = argv[++i] ?? null;
    else if (tok === '--city') o.city = argv[++i] ?? null;
    else if (tok === '--country') o.country = argv[++i] ?? 'FR';
    else if (tok === '--postal') o.postalCode = argv[++i] ?? '';
    else if (tok === '--address') o.streetAddress = argv[++i] ?? '';
    else if (tok === '--lat') o.latitude = Number(argv[++i] ?? NaN);
    else if (tok === '--lng') o.longitude = Number(argv[++i] ?? NaN);
    else if (tok === '--website') o.website = argv[++i] ?? null;
    else if (tok === '--qid') o.wikidataQid = argv[++i] ?? null;
    else if (tok === '--wp') o.wikipediaTitle = argv[++i] ?? null;
    else if (tok === '--radius') o.radius = Number(argv[++i] ?? 800);
    else if (tok === '--no-tavily') o.skipTavily = true;
    else if (!o.slug && !tok.startsWith('--')) o.slug = tok;
  }
  if (!o.slug) throw new Error('Missing <slug> argument.');
  if (!o.name) throw new Error('Missing --name "<hotel name>".');
  if (!o.city) throw new Error('Missing --city "<city name>".');
  if (o.latitude === null || Number.isNaN(o.latitude))
    throw new Error('Missing or invalid --lat <latitude>.');
  if (o.longitude === null || Number.isNaN(o.longitude))
    throw new Error('Missing or invalid --lng <longitude>.');
  return {
    slug: o.slug,
    name: o.name,
    city: o.city,
    country: o.country,
    postalCode: o.postalCode,
    streetAddress: o.streetAddress,
    latitude: o.latitude,
    longitude: o.longitude,
    website: o.website,
    wikidataQid: o.wikidataQid,
    wikipediaTitle: o.wikipediaTitle,
    radius: o.radius,
    skipTavily: o.skipTavily,
  };
}

function extractOfficialDomain(websiteUrl: string | null): string | null {
  if (!websiteUrl) return null;
  try {
    return new URL(websiteUrl).hostname.replace(/^www\./u, '');
  } catch {
    return null;
  }
}

async function resolveWikidata(qid: string | null, hotelName: string): Promise<WdHotel | null> {
  if (qid) return await fetchHotelByQid(qid);
  const results = await searchHotel(hotelName, { lang: 'fr', limit: 5 });
  if (results.length === 0) return null;
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
  candidates.push(hotelName, hotelName.replace(/^Hôtel\s+/iu, ''), `Hôtel ${hotelName}`);
  return await fetchSummaryWithFallbacks(
    Array.from(new Set(candidates.filter((c) => c.trim().length > 0))),
    'fr',
  );
}

type Settled<T> = { ok: true; value: T } | { ok: false; error: string };
async function settle<T>(p: Promise<T>): Promise<Settled<T>> {
  try {
    return { ok: true, value: await p };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  console.log(
    `\n[build-brief-manual] slug=${args.slug} name="${args.name}" city=${args.city} gps=(${args.latitude}, ${args.longitude})`,
  );

  // Assemble the source-agnostic HotelCore from CLI input.
  const hotelCore: HotelCore = {
    name: args.name,
    city: args.city,
    region: null,
    country: args.country,
    streetAddress: args.streetAddress,
    postalCode: args.postalCode,
    latitude: args.latitude,
    longitude: args.longitude,
    website: args.website,
    descriptionShort: null,
    descriptionLong: null,
    stars: 5,
    isPalace: true,
    sourceUri: null,
    sourceLabel: 'Manual entry — Atout France Palace registry (https://palace.atout-france.fr)',
  };

  // POIs require coordinates; DATAtourisme catalog is shared across France
  // so we can still query nearby POIs even though the hotel itself isn't
  // catalogued there. We allow this to fail silently (rural areas may have
  // sparse coverage).
  console.log(`\n[build-brief-manual] fetching POIs within ${args.radius}m…`);
  let pois: readonly DtPoi[] = [];
  try {
    pois = await fetchPOIsAround(args.latitude, args.longitude, {
      radiusMeters: args.radius,
      limit: 50,
    });
    console.log(`  ${pois.length} curated POI(s)`);
    pois
      .slice(0, 10)
      .forEach((p) => console.log(`    - [${p.category}] ${p.name} @ ${p.distanceMeters}m`));
  } catch (e) {
    console.log(`  ⚠ POI fetch failed: ${(e as Error).message}`);
  }

  const officialDomain = extractOfficialDomain(args.website);
  console.log(`\n[build-brief-manual] enriching from Wikidata + Wikipedia + Tavily…`);
  console.log(`  official domain (Tavily target): ${officialDomain ?? '✗ none'}`);

  const [wdSettled, wpSettled, diningSettled, capacitySettled, wellnessSettled, servicesSettled] =
    await Promise.all([
      settle(resolveWikidata(args.wikidataQid, args.name)),
      settle(resolveWikipedia(args.wikipediaTitle, args.name)),
      args.skipTavily
        ? settle(Promise.resolve<DiningExtractionResult | null>(null))
        : settle(extractDining({ hotelName: args.name, city: args.city, officialDomain })),
      args.skipTavily
        ? settle(Promise.resolve<CapacityExtractionResult | null>(null))
        : settle(
            extractCapacity({
              hotelName: args.name,
              city: args.city,
              officialDomain,
              fallbackNarrative: null,
            }),
          ),
      args.skipTavily
        ? settle(Promise.resolve<WellnessExtractionResult | null>(null))
        : settle(extractWellness({ hotelName: args.name, city: args.city, officialDomain })),
      args.skipTavily
        ? settle(Promise.resolve<ServicesExtractionResult | null>(null))
        : settle(extractServices({ hotelName: args.name, city: args.city, officialDomain })),
    ]);

  let wikidata: WdHotel | null = null;
  let wikipedia: WpSummary | null = null;
  let diningRes: DiningExtractionResult | null = null;
  let capacityRes: CapacityExtractionResult | null = null;
  let wellnessRes: WellnessExtractionResult | null = null;
  let servicesRes: ServicesExtractionResult | null = null;

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
    console.log(`  Wikidata: ⚠ ${wdSettled.error}`);
  }

  if (wpSettled.ok) {
    wikipedia = wpSettled.value;
    console.log(
      wikipedia
        ? `  Wikipedia: ${wikipedia.title} (${wikipedia.extract.length} chars)`
        : `  Wikipedia: ✗`,
    );
  } else {
    console.log(`  Wikipedia: ⚠ ${wpSettled.error}`);
  }

  if (diningSettled.ok) {
    diningRes = diningSettled.value;
    if (diningRes) {
      console.log(
        `  Tavily/dining: ${diningRes.outlets.length} outlet(s) — ${diningRes.searchCount}s+${diningRes.extractCount}e calls`,
      );
      for (const o of diningRes.outlets) {
        console.log(
          `    • ${o.name} [${o.type}] — chef=${o.chef ?? '?'} stars=${o.michelinStars ?? '?'} cuisine=${o.cuisine ?? '?'}`,
        );
      }
    }
  } else {
    console.log(`  Tavily/dining: ⚠ ${diningSettled.error}`);
  }

  if (capacitySettled.ok) {
    capacityRes = capacitySettled.value;
    if (capacityRes?.capacity) {
      const c = capacityRes.capacity;
      console.log(
        `  Tavily/capacity: total=${c.totalKeys ?? '?'} rooms=${c.roomsCount ?? '?'} suites=${c.suitesCount ?? '?'} surface=${c.minRoomSurfaceM2 ?? '?'}-${c.maxRoomSurfaceM2 ?? '?'}m²`,
      );
    }
  } else {
    console.log(`  Tavily/capacity: ⚠ ${capacitySettled.error}`);
  }

  if (wellnessSettled.ok) {
    wellnessRes = wellnessSettled.value;
    if (wellnessRes?.wellness) {
      const w = wellnessRes.wellness;
      console.log(
        `  Tavily/wellness: spa=${w.spaName ?? '?'} brand=${w.partnerBrand ?? '?'} surface=${w.surfaceM2 ?? '?'} pool=${w.hasPool ?? '?'} treatments=${w.signatureTreatments.length}`,
      );
    }
  } else {
    console.log(`  Tavily/wellness: ⚠ ${wellnessSettled.error}`);
  }

  if (servicesSettled.ok) {
    servicesRes = servicesSettled.value;
    if (servicesRes?.services) {
      const s = servicesRes.services;
      console.log(
        `  Tavily/services: langs=[${s.languagesSpoken.join(', ') || '?'}] valet=${s.hasValetParking ?? '?'} transfer=${s.hasAirportTransfer ?? '?'} pets=${s.petsAllowed ?? '?'} clefsdor=${s.conciergeClefsDor ?? '?'} 24h=${s.has24hRoomService ?? '?'}`,
      );
    }
  } else {
    console.log(`  Tavily/services: ⚠ ${servicesSettled.error}`);
  }

  console.log(`\n[build-brief-manual] assembling brief…`);
  const brief = buildBriefFromSources(
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

  const outDir = resolve(process.cwd(), 'briefs-auto');
  await mkdir(outDir, { recursive: true });
  const outPath = resolve(outDir, `${args.slug}.json`);
  await writeFile(outPath, JSON.stringify(brief, null, 2), 'utf-8');
  console.log(
    `\n✓ Brief written → briefs-auto/${args.slug}.json (${JSON.stringify(brief).length} bytes)`,
  );
}

main().catch((err) => {
  console.error(`[build-brief-manual] FAILED: ${(err as Error).message}`);
  if ((err as Error).stack) console.error((err as Error).stack);
  process.exit(1);
});
