/**
 * scrape-yonder-fr.ts — build the FR-only hotel catalog covered by yonder.fr.
 *
 * WS0 of the Phase 1 editorial plan: freezes the list of hotels we must cover
 * to reach parity with yonder.fr on the French market.
 *
 * Pipeline:
 *   1. For each yonder page in `yonder-pages.ts`:
 *      a. Read markdown from local cache (`data/yonder-raw/<slug>.md`) if
 *         present, otherwise call Tavily Extract (advanced) and persist.
 *      b. Apply two extractors:
 *         - Section parser: detects `### N. Name` headings (Top X format).
 *         - Hotel-link parser: detects every yonder URL pointing to a hotel
 *           detail page (cityguide, hotels-du-mois single, hotels-de-legende,
 *           openings, sub-pages of Tops). The URL slug IS the canonical
 *           yonder slug.
 *   2. Aggregate by yonder slug → merge classifications + source pages.
 *   3. Cross-check against `docs/editorial/pilots-auto/*.md` (existing CCT
 *      drafts) using token Jaccard + substring fallback.
 *   4. Write `data/yonder-fr-hotels.json`.
 *
 * Re-run safely: cached pages are reused; pass `--no-cache` to force-refresh.
 *
 * Run:  pnpm --filter @cct/editorial-pilot exec tsx src/yonder/scrape-yonder-fr.ts
 */

import { readdir, readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tavilyExtract } from '../enrichment/tavily-client.js';
import { slugify } from '../enrichment/brief-builder.js';
import { YONDER_PAGES, type YonderPage, type YonderPageScope } from './yonder-pages.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '../../../..');
const PILOTS_DIR = resolve(REPO_ROOT, 'docs/editorial/pilots-auto');
const OUT_DIR = resolve(__dirname, '../../data');
const RAW_DIR = resolve(OUT_DIR, 'yonder-raw');
const OUT_PATH = resolve(OUT_DIR, 'yonder-fr-hotels.json');

const NO_CACHE = process.argv.includes('--no-cache');

// ─── Types ────────────────────────────────────────────────────────────────

interface ExtractedHotel {
  /** Stable identifier (yonder slug). */
  readonly slug: string;
  /** Best-effort name (raw heading or derived from slug). */
  readonly name: string;
  /** City detected from postal-code regex when present. */
  readonly city: string | null;
  /** Postal code when present (5 digits + city name). */
  readonly postalCode: string | null;
  /** Region detected from H2 ancestor heading or page hint. */
  readonly region: string | null;
  /** Detail URL on yonder.fr (when extracted from a link). */
  readonly detailUrl: string | null;
}

export interface YonderFrHotel {
  readonly slug: string;
  readonly name: string;
  readonly city: string | null;
  readonly region: string | null;
  readonly postalCode: string | null;
  readonly detailUrls: readonly string[];
  readonly classifications: readonly YonderPageScope[];
  readonly yonderSourcePages: readonly string[];
  readonly cctAlreadyDrafted: boolean;
  readonly cctSlug: string | null;
}

interface ScrapeReport {
  readonly scrapedAt: string;
  readonly sourcePages: ReadonlyArray<{
    readonly url: string;
    readonly label: string;
    readonly scope: YonderPageScope;
    readonly hotelsExtracted: number;
    readonly extractStatus: 'ok' | 'failed' | 'cached';
    readonly extractError?: string;
  }>;
  readonly hotels: readonly YonderFrHotel[];
  readonly summary: {
    readonly totalHotels: number;
    readonly palaces: number;
    readonly fiveStars: number;
    readonly fourStars: number;
    readonly cctAlreadyDrafted: number;
    readonly cctMissingSlugs: readonly string[];
    readonly toGenerate: number;
  };
}

// ─── CCT existing slugs ───────────────────────────────────────────────────

async function loadCctExistingSlugs(): Promise<readonly string[]> {
  const files = await readdir(PILOTS_DIR);
  const slugs = files
    .filter((f) => f.endsWith('.md') && !/\.phase\d+\.md$/u.test(f))
    .map((f) => f.replace(/\.md$/u, ''));
  return slugs.sort();
}

const STOPWORDS = new Set([
  'hotel',
  'hotels',
  'the',
  'les',
  'des',
  'du',
  'de',
  'la',
  'le',
  'and',
  'spa',
  'palace',
  'palaces',
  'rosewood',
  'collection',
  'maison',
  'maisons',
  'sa',
  'son',
  'son-',
]);

/**
 * Tokens that disambiguate two hotels with otherwise identical brand names
 * (Cheval Blanc Courchevel vs Cheval Blanc Paris, Mandarin Oriental Paris vs
 * Lutetia, La Réserve Paris vs Beaulieu, etc.).
 *
 * If BOTH slugs contain a token from this set AND the sets are disjoint, the
 * match is rejected — this prevents phantom matches that would hide real
 * hotels from the "to generate" list.
 */
const PLACE_TOKENS = new Set([
  // Paris / IDF
  'paris',
  'lutetia',
  'versailles',
  'fontainebleau',
  'chantilly',
  'rambouillet',
  // Côte d'Azur / PACA / Sud
  'cannes',
  'nice',
  'antibes',
  'monaco',
  'mougins',
  'beaulieu',
  'ferrat',
  'tropez',
  'ramatuelle',
  'gassin',
  'pampelonne',
  'porquerolles',
  'aix',
  'avignon',
  'baux',
  'gordes',
  'eze',
  'menton',
  'grasse',
  'arles',
  'cassis',
  // Alpes
  'courchevel',
  'meribel',
  'megeve',
  'chamonix',
  'tignes',
  'isere',
  'samoens',
  'flaine',
  'verbier',
  'evian',
  'annecy',
  // Sud-Ouest
  'biarritz',
  'bordeaux',
  'eugenie',
  'caudalie',
  'pyrenees',
  'cap-ferret',
  'arcachon',
  'pyla',
  'pilat',
  'martillac',
  // Bretagne / Normandie / Nord
  'malo',
  'rennes',
  'nantes',
  'cabourg',
  'deauville',
  'honfleur',
  'lille',
  // Centre / Loire / Champagne / Bourgogne
  'reims',
  'epernay',
  'champagne',
  'tours',
  'beaune',
  'dijon',
  // Corse
  'corse',
  'ajaccio',
  'porto',
  'bonifacio',
  'calvi',
  'bastia',
  'sartene',
  // International (rejection signal — yonder mixes Italy etc. in some FR pages)
  'barth',
  'maldives',
  'marrakech',
  'marrakesh',
  'venezia',
  'roma',
  'milano',
  'capri',
  // Provence countryside
  'ventoux',
  'luberon',
  'alpilles',
  'camargue',
  // Specific micro-locations from yonder slugs
  'puy',
  'reparade',
  'martin',
  'vence',
  'apogee',
  'k2',
]);

function extractPlaceTokens(slug: string): Set<string> {
  const out = new Set<string>();
  for (const part of slug.split(/[-_]/u)) {
    if (PLACE_TOKENS.has(part)) out.add(part);
  }
  return out;
}

/**
 * Two slugs have conflicting places when BOTH have ≥ 1 place token AND the
 * sets are disjoint OR each has at least one token absent from the other.
 * Subset/superset relations are allowed (e.g. `lapogee-courchevel` places
 * `{courchevel}` ⊂ `l-apogee-courchevel` places `{courchevel, apogee}`).
 *
 * Lutetia and similar brand-rename traps still bypass this rule via the
 * MANUAL_MATCHES override list (which short-circuits the matcher).
 */
function hasConflictingPlaces(a: string, b: string): boolean {
  const aPlaces = extractPlaceTokens(a);
  const bPlaces = extractPlaceTokens(b);
  if (aPlaces.size === 0 || bPlaces.size === 0) return false;
  // Subset/superset → no conflict.
  let intersectionSize = 0;
  for (const p of aPlaces) if (bPlaces.has(p)) intersectionSize += 1;
  if (intersectionSize === Math.min(aPlaces.size, bPlaces.size)) return false;
  return true;
}

/**
 * Manual matches for known edge cases the algorithm cannot infer:
 *   - Brand transitions (Lutetia → Mandarin Oriental Lutetia)
 *   - Slug naming drift (Airelles uses historic chateau names, l'Apogée vs
 *     lapogee in our CCT slugs)
 *   - Plaza Athénée and other palaces named with arrondissement suffixes
 * Keys are yonder slugs, values are CCT slugs.
 */
const MANUAL_MATCHES: ReadonlyMap<string, string> = new Map([
  ['mandarin-oriental-lutetia-paris-6e', 'hotel-lutetia'],
  ['lutetia-paris-vie', 'hotel-lutetia'],
  ['plaza-athenee-paris-viiie', 'plaza-athenee-paris'],
  ['plaza-athenee-paris-8e', 'plaza-athenee-paris'],
  ['chateau-de-la-messardiere-palace-restaurant-gastronomique', 'les-airelles-saint-tropez'],
  ['l-apogee-courchevel', 'lapogee-courchevel'],
]);

function tokenize(s: string): Set<string> {
  const tokens = s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/[^a-z0-9]+/gu, ' ')
    .split(/\s+/u)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
  return new Set(tokens);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = new Set([...a, ...b]).size;
  return inter / union;
}

/**
 * Soft match between a yonder slug and a CCT slug. Three signals, each
 * sufficient on its own:
 *
 *   1. **Jaccard ≥ 0.45** on filtered tokens — robust generic case.
 *   2. **Strong overlap**: ≥ 2 shared discriminating tokens — handles long
 *      multi-word names where one side has extra qualifiers.
 *   3. **Discriminating containment**: the smaller side is 100% included in
 *      the larger AND its tokens average ≥ 5 chars — handles cases like
 *      `hotel-lutetia` (CCT) ↔ `mandarin-oriental-lutetia-paris-6e` (yonder)
 *      where the CCT slug uses a short trade name and the yonder slug adds
 *      brand prefix + arrondissement. The 5-char minimum guards against
 *      accidental matches on common words.
 */
function matchYonderToCct(yonderSlug: string, cctSlugs: readonly string[]): string | null {
  const manual = MANUAL_MATCHES.get(yonderSlug);
  if (manual && cctSlugs.includes(manual)) return manual;

  const yTokens = tokenize(yonderSlug);
  if (yTokens.size === 0) return null;

  let best: { slug: string; score: number } | null = null;
  for (const cct of cctSlugs) {
    if (hasConflictingPlaces(yonderSlug, cct)) continue;

    const cTokens = tokenize(cct);
    if (cTokens.size === 0) continue;

    const j = jaccard(yTokens, cTokens);
    let score = j;

    let intersection = 0;
    for (const t of yTokens) if (cTokens.has(t)) intersection += 1;

    // Strong overlap boost only if no place conflict (already filtered above).
    if (intersection >= 3) {
      score = Math.max(score, 0.7);
    }

    // Discriminating containment — smaller set fully inside larger AND smaller
    // has ≥ 2 tokens of average length ≥ 5 chars (avoids single-token noise).
    const smaller = yTokens.size <= cTokens.size ? yTokens : cTokens;
    const larger = smaller === yTokens ? cTokens : yTokens;
    if (smaller.size >= 2) {
      let smallerContained = 0;
      for (const t of smaller) if (larger.has(t)) smallerContained += 1;
      if (smallerContained === smaller.size) {
        const avgLen = [...smaller].reduce((acc, t) => acc + t.length, 0) / smaller.size;
        if (avgLen >= 5) score = Math.max(score, 0.65);
      }
    }

    if (best === null || score > best.score) best = { slug: cct, score };
  }
  return best && best.score >= 0.5 ? best.slug : null;
}

// ─── Tavily fetch with caching ────────────────────────────────────────────

function pageCacheSlug(page: YonderPage): string {
  return slugify(page.label);
}

async function fetchPageMarkdown(page: YonderPage): Promise<{ markdown: string; cached: boolean }> {
  const cachePath = resolve(RAW_DIR, `${pageCacheSlug(page)}.md`);
  if (!NO_CACHE) {
    try {
      const stats = await stat(cachePath);
      if (stats.isFile() && stats.size > 200) {
        const md = await readFile(cachePath, 'utf-8');
        return { markdown: md, cached: true };
      }
    } catch {
      // miss → fetch
    }
  }
  const res = await tavilyExtract({
    urls: [page.url],
    extractDepth: 'advanced',
    format: 'markdown',
  });
  const first = res.results[0];
  if (!first || first.rawContent.length === 0) {
    throw new Error('Tavily returned empty content');
  }
  await mkdir(RAW_DIR, { recursive: true });
  await writeFile(cachePath, first.rawContent, 'utf-8');
  return { markdown: first.rawContent, cached: false };
}

// ─── Extractors ───────────────────────────────────────────────────────────

const POSTAL_CITY_RE = /\b(\d{5})\s+([A-ZÉÈÊÀÂÔÎÛŒÇa-zéèêàâôîûœç' -]{3,40})\b/u;
const REGION_HINT_RE =
  /(provence|alpes|paris|sud-?ouest|nord|atlantique|corse|champagne|côte d'azur|île-de-france|grand est|alsace|bretagne|normandie|occitanie|loire|aquitaine|bourgogne|auvergne|rhône-alpes|hauts-de-france)/iu;

/**
 * Yonder hotel detail URL patterns (FR site). Each pattern matches BOTH
 * absolute (`https://www.yonder.fr/...`) and relative (`/...`) URLs — yonder
 * mixes both forms in the markdown Tavily returns. The captured group is the
 * hotel slug. Pages without a hotel-specific final segment are excluded.
 */
const URL_PREFIX = '(?:https?:\\/\\/(?:www\\.)?yonder\\.fr)?';
const URL_SUFFIX = '(?:\\/|$|[?#"\'\\s)])';

const HOTEL_DETAIL_URL_PATTERNS: readonly RegExp[] = [
  // Cityguide hotel detail: /cityguides/<city>/hotels/<slug>
  new RegExp(
    `${URL_PREFIX}\\/cityguides\\/([a-z0-9-]+)\\/hotels\\/([a-z0-9-]+)${URL_SUFFIX}`,
    'giu',
  ),
  // Top X sub-page: /les-tops/hotels/<top-slug>/<hotel-slug>
  new RegExp(`${URL_PREFIX}\\/les-tops\\/hotels\\/([a-z0-9-]+)\\/([a-z0-9-]+)${URL_SUFFIX}`, 'giu'),
  // Hotels du mois single (heuristic: slug must NOT start with a "top X" prefix — see NOT_A_HOTEL_PATTERNS).
  new RegExp(`${URL_PREFIX}\\/hotels\\/hotels-du-mois\\/([a-z0-9-]+)${URL_SUFFIX}`, 'giu'),
  // Openings (new hotel announcement)
  new RegExp(`${URL_PREFIX}\\/hotels\\/openings\\/([a-z0-9-]+)${URL_SUFFIX}`, 'giu'),
  // Hotels de légende
  new RegExp(`${URL_PREFIX}\\/hotels\\/hotels-de-legende\\/([a-z0-9-]+)${URL_SUFFIX}`, 'giu'),
  // Avis hotel (single review)
  new RegExp(`${URL_PREFIX}\\/hotels\\/avis\\/([a-z0-9-]+)${URL_SUFFIX}`, 'giu'),
];

/**
 * Slugs that look like a "top/list/category" page rather than a single hotel.
 * Used to filter the noisy `/hotels/hotels-du-mois/<slug>` and `/les-tops/<...>/<slug>`
 * captures. A slug matches when it starts with one of these prefixes/keywords.
 */
const NOT_A_HOTEL_PATTERNS: readonly RegExp[] = [
  /^(les-?)?(plus-?|meilleurs?|top|10-|20-|30-|nos-)/u,
  // Numeric prefix followed by a top-list keyword — `15-plus-beaux-hotels-…`.
  /^\d+-(plus-|meilleurs?-|tops?-|top|hotels-|nouveaux-)/u,
  /^(hotel-?)?cote-/u,
  /^(hotel-?)?bord-/u,
  /^(hotel-?)?week-?end/u,
  /^(les-?)?palaces-/u,
  /-en-france(?:$|-)/u,
  /-de-france(?:$|-)/u,
  /(?:^|-)hotels-(?:du-mois|de-legende|chic|design|lifestyle|romantique|famille|spa)/u,
  /^(notre|nos|comment|que-faire|pourquoi|combien)/u,
];

function looksLikeHotelSlug(slug: string): boolean {
  if (slug.length < 3 || slug.length > 80) return false;
  for (const re of NOT_A_HOTEL_PATTERNS) {
    if (re.test(slug)) return false;
  }
  return true;
}

/**
 * Extract every hotel-detail link from the markdown. Each capture becomes
 * an `ExtractedHotel` with the URL slug as its identifier.
 */
function extractHotelLinks(markdown: string, page: YonderPage): ExtractedHotel[] {
  const found = new Map<string, ExtractedHotel>();
  for (const pattern of HOTEL_DETAIL_URL_PATTERNS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(markdown)) !== null) {
      // Patterns with two groups: city + hotel slug. We always want the LAST
      // captured group as the hotel slug.
      const slug = m[m.length - 1] ?? '';
      if (!looksLikeHotelSlug(slug)) continue;
      const url = m[0];
      if (found.has(slug)) continue;
      found.set(slug, {
        slug,
        name: humanizeSlug(slug),
        city: null,
        postalCode: null,
        region: page.regionHint ?? null,
        detailUrl: url,
      });
    }
  }
  return [...found.values()];
}

function humanizeSlug(slug: string): string {
  return slug
    .split('-')
    .filter((s) => s.length > 0)
    .map((w) => (w.length <= 2 ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

/**
 * Section parser — for "Top X" pages whose body is `### N. Name` followed by
 * a description and a club.yonder.fr link. Captures any heading at H2/H3
 * level with a leading number, plus headings that contain a club link in
 * the body (defensive fallback for varied formatting).
 */
const HEADING_LINE_RE = /^(#{1,3})\s+(.+?)\s*$/u;
const NUMBER_PREFIX_RE = /^\*{0,2}\s*(\d+)\.\s+(.+?)\*{0,2}\s*$/u;
// Exclude generic category/page/tag links (e.g. /category/hotel-de-luxe-paris/);
// only hotel-specific slugs are useful for cross-referencing.
const CLUB_YONDER_LINK_RE =
  /https?:\/\/club\.yonder\.fr\/(?!(?:category|page|tag|sample-page|wp-content)\/)([a-z0-9-]+)\//giu;

function parseHotelSections(markdown: string, page: YonderPage): ExtractedHotel[] {
  const lines = markdown.split(/\r?\n/u);
  type Block = {
    headingRaw: string;
    body: string[];
    region: string | null;
  };
  const blocks: Block[] = [];
  let current: Block | null = null;
  let lastRegionHeading: string | null = null;

  for (const line of lines) {
    const m = line.match(HEADING_LINE_RE);
    if (m) {
      const level = m[1]!.length;
      const heading = m[2]!.trim();
      // Region context update from H1/H2 (Sommaire structure).
      if (level <= 2) {
        const reg = heading.match(REGION_HINT_RE);
        if (reg) lastRegionHeading = capitalize(reg[1] ?? '');
      }
      // Open new block when heading looks like a hotel entry.
      if (
        NUMBER_PREFIX_RE.test(heading) ||
        // Defensive: H3 heading without number but body might hold a club link.
        level === 3
      ) {
        if (current) blocks.push(current);
        current = { headingRaw: heading, body: [], region: lastRegionHeading };
      } else {
        if (current) blocks.push(current);
        current = null;
      }
      continue;
    }
    if (current) current.body.push(line);
  }
  if (current) blocks.push(current);

  const out: ExtractedHotel[] = [];
  for (const b of blocks) {
    const numbered = b.headingRaw.match(NUMBER_PREFIX_RE);
    const cleaned = stripDecoration(numbered ? numbered[2]! : b.headingRaw);
    if (cleaned.length < 3) continue;

    const body = b.body.join('\n');
    CLUB_YONDER_LINK_RE.lastIndex = 0;
    const clubMatch = CLUB_YONDER_LINK_RE.exec(body);
    const clubSlug = clubMatch ? (clubMatch[1] ?? null) : null;

    // Skip non-hotel sections without a club link AND without a number prefix.
    if (!numbered && !clubSlug) continue;

    const slug = clubSlug ?? slugify(cleaned);
    if (!looksLikeHotelSlug(slug)) continue;

    const postalMatch = body.match(POSTAL_CITY_RE);
    out.push({
      slug,
      name: cleaned,
      city: postalMatch ? (postalMatch[2]?.trim() ?? null) : null,
      postalCode: postalMatch ? (postalMatch[1] ?? null) : null,
      region: b.region ?? page.regionHint ?? null,
      detailUrl: null,
    });
  }
  return out;
}

function stripDecoration(name: string): string {
  return name
    .replace(/^\*+|\*+$/gu, '')
    .split('|')[0]!
    .replace(/\([^)]*\)\s*$/u, '')
    .replace(/^\s*\d+\.\s+/u, '')
    .trim();
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Aggregation ──────────────────────────────────────────────────────────

interface Aggregate {
  slug: string;
  name: string;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  detailUrls: Set<string>;
  classifications: Set<YonderPageScope>;
  yonderPages: Set<string>;
}

function mergeInto(prev: Aggregate, next: ExtractedHotel, page: YonderPage): void {
  prev.classifications.add(page.scope);
  prev.yonderPages.add(page.url);
  if (next.detailUrl) prev.detailUrls.add(next.detailUrl);
  if (!prev.city && next.city) prev.city = next.city;
  if (!prev.postalCode && next.postalCode) prev.postalCode = next.postalCode;
  if (!prev.region && next.region) prev.region = next.region;
  if (next.name.length > prev.name.length) prev.name = next.name;
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(
    `[yonder] scraping ${YONDER_PAGES.length} pages (cache: ${NO_CACHE ? 'OFF' : 'ON'})…`,
  );

  const cctSlugs = await loadCctExistingSlugs();
  console.log(`[yonder] loaded ${cctSlugs.length} existing CCT slugs from pilots-auto/`);

  const sourceReport: Array<ScrapeReport['sourcePages'][number]> = [];
  const aggregates = new Map<string, Aggregate>();

  for (const page of YONDER_PAGES) {
    process.stdout.write(`  → ${page.label} … `);
    let markdown = '';
    let cached = false;
    let extractStatus: 'ok' | 'failed' | 'cached' = 'ok';
    let extractError: string | undefined;
    try {
      const fetched = await fetchPageMarkdown(page);
      markdown = fetched.markdown;
      cached = fetched.cached;
      if (cached) extractStatus = 'cached';
    } catch (err) {
      extractStatus = 'failed';
      extractError = err instanceof Error ? err.message : String(err);
      sourceReport.push({
        url: page.url,
        label: page.label,
        scope: page.scope,
        hotelsExtracted: 0,
        extractStatus,
        ...(extractError ? { extractError } : {}),
      });
      console.log(`FAILED — ${extractError}`);
      continue;
    }

    const sectionsHotels = parseHotelSections(markdown, page);
    const linkHotels = extractHotelLinks(markdown, page);

    // Merge: link extraction is more authoritative for slug shape, so we
    // process links first, then add sections that bring NEW slugs.
    const seenInPage = new Set<string>();
    let countAdded = 0;
    for (const h of [...linkHotels, ...sectionsHotels]) {
      if (seenInPage.has(h.slug)) continue;
      seenInPage.add(h.slug);
      const existing = aggregates.get(h.slug);
      if (existing) {
        mergeInto(existing, h, page);
      } else {
        aggregates.set(h.slug, {
          slug: h.slug,
          name: h.name,
          city: h.city,
          region: h.region ?? page.regionHint ?? null,
          postalCode: h.postalCode,
          detailUrls: new Set(h.detailUrl ? [h.detailUrl] : []),
          classifications: new Set([page.scope]),
          yonderPages: new Set([page.url]),
        });
      }
      countAdded += 1;
    }
    sourceReport.push({
      url: page.url,
      label: page.label,
      scope: page.scope,
      hotelsExtracted: countAdded,
      extractStatus,
    });
    console.log(`${countAdded} hotels${cached ? ' (cached)' : ''}`);
  }

  // Cross-check against CCT existing drafts.
  const cctMatched = new Set<string>();
  const hotels: YonderFrHotel[] = [];
  for (const agg of aggregates.values()) {
    const cctSlug = matchYonderToCct(agg.slug, cctSlugs);
    if (cctSlug) cctMatched.add(cctSlug);
    hotels.push({
      slug: agg.slug,
      name: agg.name,
      city: agg.city,
      region: agg.region,
      postalCode: agg.postalCode,
      detailUrls: [...agg.detailUrls].sort(),
      classifications: [...agg.classifications].sort(),
      yonderSourcePages: [...agg.yonderPages].sort(),
      cctAlreadyDrafted: cctSlug !== null,
      cctSlug,
    });
  }
  hotels.sort((a, b) => a.slug.localeCompare(b.slug, 'fr'));

  const palaces = hotels.filter((h) => h.classifications.includes('palace')).length;
  const fiveStars = hotels.filter((h) =>
    h.classifications.some((c) => c === '5-etoiles' || c === 'palace'),
  ).length;
  const fourStars = hotels.filter((h) => h.classifications.includes('4-etoiles')).length;
  const cctAlreadyDrafted = hotels.filter((h) => h.cctAlreadyDrafted).length;
  const cctMissingSlugs = cctSlugs.filter((s) => !cctMatched.has(s));

  const report: ScrapeReport = {
    scrapedAt: new Date().toISOString(),
    sourcePages: sourceReport,
    hotels,
    summary: {
      totalHotels: hotels.length,
      palaces,
      fiveStars,
      fourStars,
      cctAlreadyDrafted,
      cctMissingSlugs,
      toGenerate: hotels.length - cctAlreadyDrafted,
    },
  };

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(report, null, 2), 'utf-8');

  console.log('\n━━━ Summary ━━━');
  console.log(`  Total unique yonder FR hotels:      ${report.summary.totalHotels}`);
  console.log(`  Tagged 'palace':                    ${report.summary.palaces}`);
  console.log(`  Tagged '5-etoiles' or 'palace':     ${report.summary.fiveStars}`);
  console.log(`  Tagged '4-etoiles':                 ${report.summary.fourStars}`);
  console.log(`  Already drafted on CCT:             ${report.summary.cctAlreadyDrafted}`);
  console.log(`  To generate:                        ${report.summary.toGenerate}`);
  console.log(`  CCT slugs not in yonder catalog:    ${report.summary.cctMissingSlugs.length}`);
  if (report.summary.cctMissingSlugs.length > 0) {
    for (const s of report.summary.cctMissingSlugs) console.log(`    • ${s}`);
  }
  console.log(`\n✓ Wrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error('[scrape-yonder-fr] FAILED:', err);
  process.exit(1);
});
