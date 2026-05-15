/**
 * scrape-yonder-tops-index.ts — exhaustive index of Yonder.fr "Tops".
 *
 * WS0bis of the rankings-parity-yonder plan: enumerates every ranking
 * page Yonder publishes under `/les-tops/hotels` so we can calibrate
 * our editorial matrice against the real competitor surface.
 *
 * Pipeline:
 *   1. Walk `https://www.yonder.fr/les-tops/hotels` then `/?page=<n>`
 *      (Drupal-style `?page=N` is 0-indexed for pages 2-25 — see
 *      `pageUrl` below). We sweep the full 25-page archive and stop
 *      early when two consecutive pages add zero new entries.
 *   2. Parse each page markdown for `/les-tops/hotels/<slug>` links
 *      (both absolute and relative; the markdown returned by Tavily
 *      uses both forms). The slug is the canonical Yonder ranking
 *      identifier; the anchor text + `title` attribute + next
 *      paragraph give us `title` + `excerpt`.
 *   3. Filter to FR-only entries via `isFrenchTitle()` keyword check.
 *   4. Persist to `data/yonder-tops-fr-index.json`.
 *
 * Cache: each fetched page's raw markdown is cached in
 * `data/yonder-tops-raw/page-<n>.md` (pattern WS0). Re-runs reuse the
 * cache; pass `--no-cache` to force a refresh (costs 2 Tavily credits
 * per page, ~25 pages = ~50 credits).
 *
 * Run:
 *   pnpm --filter @cct/editorial-pilot exec tsx \
 *     src/yonder/scrape-yonder-tops-index.ts
 */

import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { tavilyExtract } from '../enrichment/tavily-client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUT_DIR = resolve(__dirname, '../../data');
const RAW_DIR = resolve(OUT_DIR, 'yonder-tops-raw');
const OUT_PATH = resolve(OUT_DIR, 'yonder-tops-fr-index.json');

const NO_CACHE = process.argv.includes('--no-cache');
/**
 * Yonder ships 25 pages of Tops as of May 2026 (verified via the
 * pagination footer linking to `?page=24`, the 0-indexed last). We cap
 * at 30 to absorb future growth and bail out via the
 * `STOP_AFTER_EMPTY_PAGES` early-exit when nothing new shows up.
 */
const MAX_PAGES = 30;
const STOP_AFTER_EMPTY_PAGES = 3;
const BASE_URL = 'https://www.yonder.fr/les-tops/hotels';

// ─── Types ────────────────────────────────────────────────────────────────

export interface YonderTopEntry {
  /** URL slug under `/les-tops/hotels/`. */
  readonly slug: string;
  /** Display title as captured from the anchor text. */
  readonly title: string;
  /** Full URL on yonder.fr. */
  readonly url: string;
  /** Optional short excerpt found below the link, when present. */
  readonly excerpt: string | null;
  /** Page number of the index where this entry was first seen. */
  readonly indexPage: number;
}

export interface YonderTopsIndex {
  readonly scrapedAt: string;
  readonly totalEntries: number;
  readonly frenchEntries: number;
  readonly nonFrenchEntries: number;
  readonly pagesScraped: number;
  /** All entries (incl. non-FR), useful for QA / debugging. */
  readonly all: readonly YonderTopEntry[];
  /** FR-only entries — primary input for the matrix calibration. */
  readonly french: readonly YonderTopEntry[];
}

// ─── French heuristic ─────────────────────────────────────────────────────

/**
 * Tokens that mark a Top as France-focused. We require AT LEAST one
 * positive signal AND no hard negative signal. Conservative: when in
 * doubt the entry is kept (downstream classification will tag it).
 */
const FR_POSITIVE_TOKENS = [
  'france',
  'paris',
  'provence',
  'cote-d-azur',
  'cote-azur',
  'corse',
  'bretagne',
  'normandie',
  'bordeaux',
  'champagne',
  'reims',
  'biarritz',
  'cannes',
  'nice',
  'antibes',
  'monaco',
  'megeve',
  'megève',
  'courchevel',
  'meribel',
  'chamonix',
  'saint-tropez',
  'cap-ferrat',
  'cap-d-antibes',
  'gard',
  'tarn',
  'alpilles',
  'luberon',
  'aveyron',
  'auvergne',
  'occitanie',
  'aquitaine',
  'ardeche',
  'ardèche',
  'reunion',
  'réunion',
  'guadeloupe',
  'martinique',
  'corsica',
  'french',
  'francaise',
  'française',
  'francais',
  'français',
  'loire',
  'dordogne',
  'gascogne',
  'pays-basque',
  'basque',
  'normandy',
  'brittany',
  'riviera',
  'french-riviera',
  'alsace',
  'mont-blanc',
  'val-thorens',
  'val-d-isere',
  'pyrenees',
  'pyrénées',
  'arcachon',
  'pilat',
  'evian',
  'megève',
  'lyon',
  'marseille',
  'toulouse',
  'bordeaux',
  'avignon',
  'aix-en-provence',
];

/**
 * Tokens that exclude an entry as international-only (the FR site
 * occasionally publishes Tops about other countries — Italy, Spain,
 * Morocco, etc.). When BOTH a positive FR signal AND a negative
 * international signal are present (e.g. "vignobles France et Europe"),
 * we keep it (mixed list, partial FR coverage).
 */
const INTL_NEGATIVE_TOKENS = [
  'italie',
  'italy',
  'toscane',
  'tuscany',
  'venise',
  'venezia',
  'sicile',
  'rome',
  'capri',
  'lac-de-come',
  'come',
  'espagne',
  'spain',
  'rioja',
  'majorque',
  'mallorca',
  'lanzarote',
  'baleares',
  'baléares',
  'canaries',
  'ibiza',
  'maroc',
  'morocco',
  'marrakech',
  'marrakesh',
  'essaouira',
  'tanger',
  'tunisie',
  'egypte',
  'egypt',
  'jordanie',
  'jordan',
  'liban',
  'turquie',
  'turkey',
  'istanbul',
  'grece',
  'greece',
  'mykonos',
  'santorin',
  'santorini',
  'creta',
  'crete',
  'portugal',
  'porto',
  'lisbonne',
  'algarve',
  'alentejo',
  'madere',
  'açores',
  'acores',
  'royaume-uni',
  'angleterre',
  'londres',
  'ecosse',
  'irlande',
  'belgique',
  'pays-bas',
  'amsterdam',
  'allemagne',
  'germany',
  'berlin',
  'autriche',
  'vienne',
  'suisse',
  'switzerland',
  'zurich',
  'geneve',
  'genève',
  'gstaad',
  'verbier',
  'st-moritz',
  'cervinia',
  'pologne',
  'islande',
  'norvege',
  'norway',
  'suede',
  'sweden',
  'finlande',
  'danemark',
  'russie',
  'moscou',
  'usa',
  'etats-unis',
  'newyork',
  'new-york',
  'miami',
  'los-angeles',
  'californie',
  'aspen',
  'mexique',
  'cancun',
  'cuba',
  'jamaique',
  'bresil',
  'argentine',
  'chili',
  'perou',
  'colombie',
  'maldives',
  'seychelles',
  'maurice',
  'mauritius',
  'sri-lanka',
  'inde',
  'india',
  'rajasthan',
  'thailande',
  'thailand',
  'bali',
  'indonesie',
  'vietnam',
  'cambodge',
  'japon',
  'japan',
  'tokyo',
  'kyoto',
  'chine',
  'china',
  'coree',
  'singapour',
  'australie',
  'australia',
  'sydney',
  'melbourne',
  'nouvelle-zelande',
  'afrique-du-sud',
  'south-africa',
  'kenya',
  'tanzanie',
  'namibie',
  'botswana',
  'zambie',
  'rwanda',
  'gabon',
  'senegal',
  'sénégal',
  'monde',
  'world',
  'europe',
  'europeen',
  'européen',
  'asie',
  'asia',
  'caraibes',
  'caraïbes',
  'caribbean',
  'oceanie',
];

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/[^a-z0-9-]+/gu, '-');
}

/**
 * FR / non-FR heuristic. Signals operate on the slug AND title
 * concatenated to maximize recall.
 *
 * Rules (in order):
 *   - Hard FR positive (e.g. "...france", "paris", "corse") → FR.
 *   - Hard intl negative WITHOUT any FR signal → non-FR.
 *   - No signal at all → FR by default (Yonder is a French magazine,
 *     untagged Tops are usually FR; downstream LLM classification
 *     will sort them out).
 */
export function isFrenchTitle(title: string, slug: string): boolean {
  const corpus = `${normalize(title)} ${slug}`;
  const hasFr = FR_POSITIVE_TOKENS.some((t) => corpus.includes(t));
  const hasIntl = INTL_NEGATIVE_TOKENS.some((t) => corpus.includes(t));
  if (hasFr) return true;
  if (hasIntl) return false;
  return true;
}

// ─── Tavily fetch with caching ────────────────────────────────────────────

/**
 * Build the URL for the Nth index page. Yonder uses Drupal's pager:
 *   - Page 1 (first page) = base URL.
 *   - Page 2 = `?page=1` (Drupal's pager is 0-indexed for ?page).
 *   - Page N = `?page=${N - 1}`.
 */
function pageUrl(n: number): string {
  if (n === 1) return BASE_URL;
  return `${BASE_URL}?page=${n - 1}`;
}

function pageCachePath(n: number): string {
  return resolve(RAW_DIR, `page-${String(n).padStart(2, '0')}.md`);
}

async function fetchIndexPage(
  n: number,
): Promise<{ markdown: string; cached: boolean; error: string | null }> {
  const cachePath = pageCachePath(n);
  if (!NO_CACHE) {
    try {
      const stats = await stat(cachePath);
      if (stats.isFile() && stats.size > 200) {
        const md = await readFile(cachePath, 'utf-8');
        return { markdown: md, cached: true, error: null };
      }
    } catch {
      // miss → fetch
    }
  }
  try {
    const res = await tavilyExtract({
      urls: [pageUrl(n)],
      extractDepth: 'advanced',
      format: 'markdown',
    });
    const first = res.results[0];
    if (!first || first.rawContent.length === 0) {
      return { markdown: '', cached: false, error: 'empty content' };
    }
    await mkdir(RAW_DIR, { recursive: true });
    await writeFile(cachePath, first.rawContent, 'utf-8');
    return { markdown: first.rawContent, cached: false, error: null };
  } catch (err) {
    return {
      markdown: '',
      cached: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Markdown parser ──────────────────────────────────────────────────────

/**
 * Capture every `/les-tops/hotels/<slug>` link, in both absolute and
 * relative form. The optional `"<title>"` attribute (Drupal-rendered)
 * is captured separately because the anchor text on image-anchored
 * cards (`[![alt](img)](/les-tops/.../slug "title")`) is the alt of
 * the image, not the visible title — the `title` attribute is the
 * authoritative source.
 *
 * Capture groups:
 *   1. anchor text (may contain markdown image syntax)
 *   2. URL prefix (https://www.yonder.fr or empty for relative)
 *   3. slug
 *   4. optional title attribute (without quotes)
 */
const TOP_LINK_RE =
  /\[([^\]]{1,400})\]\(((?:https?:\/\/(?:www\.)?yonder\.fr)?)\/les-tops\/hotels\/([a-z0-9][a-z0-9-]+)\/?(?:\s+"([^"]+)")?\)/giu;

/** Hard-skip slugs that look like the index itself or pagination. */
const INDEX_LIKE_SLUGS = new Set([
  'hotels',
  'page',
  'category',
  'tag',
  'sample-page',
  'wp-content',
]);

/**
 * The "Page non trouvée" template Yonder serves on out-of-range
 * `?page=` values. Detected before parsing to avoid wasting cycles
 * (and mis-tagging the global navigation links as Tops).
 */
function isNotFoundPage(markdown: string): boolean {
  return /Page non trouv[ée]e/u.test(markdown.slice(0, 500));
}

/**
 * Strip a leading markdown image (`![alt](url …)`) from an anchor
 * text block, then collapse whitespace. The visible title is what's
 * left after the image (or the alt text if nothing follows).
 */
function cleanAnchorTitle(raw: string): string {
  const stripped = raw
    .replace(/^!\[([^\]]*)\]\([^)]+\)\s*/u, (_full, alt: string) => `${alt} `)
    .replace(/^["'>]\s*href\s*=\s*"[^"]*">\s*/u, '')
    .replace(/^["'>\s]+/u, '')
    .replace(/\s+/gu, ' ')
    .trim();
  return stripped;
}

function parseTopsFromMarkdown(markdown: string, indexPage: number): YonderTopEntry[] {
  if (isNotFoundPage(markdown)) return [];
  const seenSlugs = new Set<string>();
  const out: YonderTopEntry[] = [];
  TOP_LINK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOP_LINK_RE.exec(markdown)) !== null) {
    const rawAnchor = m[1] ?? '';
    const urlPrefix = m[2] ?? '';
    const slug = m[3] ?? '';
    const titleAttr = m[4] ?? '';
    if (slug.length === 0 || INDEX_LIKE_SLUGS.has(slug)) continue;
    if (seenSlugs.has(slug)) continue;

    // Title sources, in order of trust:
    //   1. explicit "title" attribute (always set on Yonder Drupal cards)
    //   2. cleaned anchor text (works on plain text links)
    //   3. humanized slug (last-resort fallback)
    const title =
      titleAttr.trim().length >= 4
        ? titleAttr.trim().replace(/\s+/gu, ' ')
        : cleanAnchorTitle(rawAnchor);
    if (title.length < 4) continue;

    const url = `${urlPrefix.length > 0 ? urlPrefix : 'https://www.yonder.fr'}/les-tops/hotels/${slug}`;

    // Heuristic excerpt: the line right after the link in the markdown.
    const after = markdown.slice(m.index + m[0].length, m.index + m[0].length + 1200);
    const excerptMatch = after.match(/\n\n([^\n[]{40,400})\n/u);
    const excerpt = excerptMatch && excerptMatch[1] ? excerptMatch[1].trim() : null;

    seenSlugs.add(slug);
    out.push({
      slug,
      title,
      url,
      excerpt,
      indexPage,
    });
  }
  return out;
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`[yonder-tops-index] sweeping ${BASE_URL} (cache: ${NO_CACHE ? 'OFF' : 'ON'})…`);

  const all = new Map<string, YonderTopEntry>();
  let pagesScraped = 0;
  let consecutiveEmpty = 0;

  for (let n = 1; n <= MAX_PAGES; n += 1) {
    process.stdout.write(`  → page ${n} … `);
    const { markdown, cached, error } = await fetchIndexPage(n);
    if (error !== null) {
      // 404 or any other failure on a high page number → end of pagination.
      console.log(`stopped (${error})`);
      break;
    }
    pagesScraped += 1;
    const entries = parseTopsFromMarkdown(markdown, n);
    let added = 0;
    for (const e of entries) {
      if (!all.has(e.slug)) {
        all.set(e.slug, e);
        added += 1;
      }
    }
    console.log(`${entries.length} link(s), ${added} new${cached ? ' (cached)' : ''}`);
    if (added === 0) {
      consecutiveEmpty += 1;
      if (consecutiveEmpty >= STOP_AFTER_EMPTY_PAGES) {
        console.log(`  ↳ ${STOP_AFTER_EMPTY_PAGES} consecutive empty pages → stop.`);
        break;
      }
    } else {
      consecutiveEmpty = 0;
    }
  }

  const allSorted = [...all.values()].sort((a, b) => a.slug.localeCompare(b.slug));
  const french = allSorted.filter((e) => isFrenchTitle(e.title, e.slug));
  const nonFrench = allSorted.length - french.length;

  const index: YonderTopsIndex = {
    scrapedAt: new Date().toISOString(),
    totalEntries: allSorted.length,
    frenchEntries: french.length,
    nonFrenchEntries: nonFrench,
    pagesScraped,
    all: allSorted,
    french,
  };

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(index, null, 2), 'utf-8');

  console.log('\n━━━ Summary ━━━');
  console.log(`  Pages scraped:        ${pagesScraped}`);
  console.log(`  Total Tops captured:  ${allSorted.length}`);
  console.log(`  French (kept):        ${french.length}`);
  console.log(`  Non-French (dropped): ${nonFrench}`);
  console.log(`\n✓ Wrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error('[scrape-yonder-tops-index] FAILED:', err);
  process.exit(1);
});
