/**
 * combinator.ts — produces the matrix of ranking seeds.
 *
 * Inputs:
 *   - The hotel catalog (`out/hotels-catalog.json`).
 *   - The classified yonder Tops (`data/yonder-tops-fr-classified.json`).
 *
 * Outputs (in-memory):
 *   - `MatrixSeed[]` — each seed has: slug, titles, axes, eligibility
 *     predicate, target length, eligible-hotel count, source
 *     (`auto` | `yonder` | `manual`), template key.
 *
 * The combinator's job is **discovery**. It does NOT call the LLM;
 * it just enumerates (type × lieu × theme × occasion) combinations
 * that satisfy the catalog eligibility floor, plus injects yonder
 * Tops we want to mirror, plus a small "manual override" list of
 * high-search-volume Tops we always want to ship.
 *
 * Eligibility floor: configurable via `MIN_ELIGIBLE`. With our
 * current 30-hotel catalog (27 palaces, 12 Paris, 5 Courchevel) we
 * use 3. As the catalog grows we'll bump it to 5 for stronger SEO.
 */

import type { HotelCatalogRow } from './load-hotels-catalog.js';
import {
  HOTEL_TYPES,
  LIEUX,
  THEMES,
  OCCASIONS,
  resolveLieu,
  type HotelType,
  type LieuDef,
  type Occasion,
  type RankingAxes,
  type Theme,
} from './axes.js';
import { renderRanking, type RenderedRankingSeed } from './templates.js';

// ─── Tunables ────────────────────────────────────────────────────────────

const MIN_ELIGIBLE = 3;
const TARGET_LENGTH_BY_LIEU_SCOPE: Readonly<Record<LieuDef['scope'], number>> = {
  france: 12,
  region: 10,
  cluster: 10,
  ville: 8,
  arrondissement: 6,
  station: 8,
  departement: 8,
  monde: 10,
};

// ─── Eligibility predicates ──────────────────────────────────────────────

const lc = (s: string): string => s.toLowerCase();

function lieuMatches(h: HotelCatalogRow, lieu: LieuDef): boolean {
  if (lieu.slug === 'france') return true;
  const c = lc(h.city);
  return lieu.hotelCityKeys.some((k) => c === lc(k) || c.includes(lc(k)));
}

/**
 * Type predicate against a single hotel row. Falls through to true
 * for `'all'` (no type filter).
 */
function typeMatches(h: HotelCatalogRow, t: HotelType): boolean {
  switch (t) {
    case 'palace':
      return h.is_palace;
    case '5-etoiles':
      return h.stars === 5;
    case '4-etoiles':
      return h.stars === 4;
    case 'all':
      return true;
    // The remaining types (boutique-hotel, chateau, chalet, villa,
    // maison-hotes, resort, ecolodge, insolite) require Payload
    // tagging not yet present on `hotels`. We mark them as eligible
    // when the hotel name contains the keyword; weak heuristic but
    // harmless until proper tagging lands.
    case 'chateau':
      return /ch[âa]teau/iu.test(h.name);
    case 'chalet':
      return /chalet/iu.test(h.name);
    case 'villa':
      return /villa/iu.test(h.name);
    case 'maison-hotes':
      return /maison/iu.test(h.name) && /h[ôo]tes?/iu.test(h.name);
    case 'resort':
      return /resort/iu.test(h.name);
    case 'ecolodge':
      return /[éee]colodge|eco[\s-]?lodge/iu.test(h.name);
    case 'boutique-hotel':
      return false;
    case 'insolite':
      return false;
    default:
      return false;
  }
}

/**
 * Theme predicate. Until Payload exposes per-hotel theme flags we
 * fall back to keyword heuristics on description + name. The match
 * is intentionally permissive (eligibility, not authority); the LLM
 * pass narrows the actual selected hotels.
 */
function themeMatches(h: HotelCatalogRow, theme: Theme): boolean {
  const hay = `${h.name} ${h.description_fr ?? ''} ${h.city}`.toLowerCase();
  switch (theme) {
    case 'romantique':
    case 'famille':
    case 'spa-bienetre':
      // Most palaces have spa — be permissive.
      return h.is_palace || /spa|wellness|bien-?[ée]tre/iu.test(hay);
    case 'gastronomie':
      return h.is_palace || /michelin|gastronomique|restaurant.*[ée]toil/iu.test(hay);
    case 'design':
      return /design|architect/iu.test(hay);
    case 'patrimoine':
      return /h[ée]ritage|patrimoine|historique|class[ée]/iu.test(hay) || h.is_palace;
    case 'vignobles':
      return /vignoble|vigne|domaine|viticole|caudalie|champagne/iu.test(hay);
    case 'mer':
      return /plage|bord de mer|c[ôo]te|lagon|m[ée]diterran/iu.test(hay);
    case 'montagne':
      return /alpes|montagne|chamonix|courchevel|m[ée]g[èe]ve|val/iu.test(hay);
    case 'campagne':
      return /campagne|domaine|gordes|provence/iu.test(hay);
    case 'urbain':
      return /paris|lyon|marseille|toulouse|bordeaux|nice/iu.test(hay);
    case 'sport-golf':
      return /golf/iu.test(hay);
    case 'sport-tennis':
      return /tennis/iu.test(hay);
    case 'sport-padel':
      return /padel/iu.test(hay);
    case 'sport-surf':
      return /surf/iu.test(hay);
    case 'sport-ski':
      return /ski|piste/iu.test(hay) || /alpes|courchevel|m[ée]g[èe]ve/iu.test(hay);
    case 'rooftop':
      return /rooftop|terrasse/iu.test(hay);
    case 'piscine':
      return /piscine|pool/iu.test(hay) || h.is_palace;
    case 'kids-friendly':
      return /famille|enfants?|kids/iu.test(hay) || h.is_palace;
    case 'insolite':
      return /insolite|extraordinaire/iu.test(hay);
    default:
      return false;
  }
}

/** Combined eligibility predicate from an axes set. */
export function eligibilityFor(axes: RankingAxes): (h: HotelCatalogRow) => boolean {
  const lieu = resolveLieu(axes.lieu.slug);
  return (h) => {
    if (lieu !== null && !lieuMatches(h, lieu)) return false;
    const type = axes.types[0] ?? 'all';
    if (!typeMatches(h, type)) return false;
    for (const th of axes.themes) {
      if (!themeMatches(h, th)) return false;
    }
    return true;
  };
}

// ─── Matrix seed ─────────────────────────────────────────────────────────

export type MatrixSource = 'auto' | 'yonder' | 'manual';

export interface MatrixSeed {
  readonly slug: string;
  readonly titleFr: string;
  readonly titleEn: string;
  readonly axes: RankingAxes;
  readonly source: MatrixSource;
  readonly templateKey: string;
  readonly targetLength: number;
  readonly eligibleCount: number;
  readonly eligibleHotelIds: readonly string[];
  /** True when at least `MIN_ELIGIBLE` hotels are available. */
  readonly hasEnoughCandidates: boolean;
  /** Yonder slug, when this seed mirrors a yonder Top. */
  readonly yonderSlug: string | null;
  /** Yonder original title (kept for cross-link / source badge). */
  readonly yonderTitle: string | null;
  /** Editorial keywords prompts for the LLM. */
  readonly keywordsFr: readonly string[];
  /** Optional editorial kind override (best_of by default). */
  readonly kind: 'best_of' | 'awarded' | 'thematic' | 'geographic';
}

function targetLengthFor(axes: RankingAxes, eligibleCount: number): number {
  const lieu = resolveLieu(axes.lieu.slug);
  const base = lieu !== null ? TARGET_LENGTH_BY_LIEU_SCOPE[lieu.scope] : 10;
  return Math.min(base, Math.max(MIN_ELIGIBLE, eligibleCount));
}

function kindFor(axes: RankingAxes): MatrixSeed['kind'] {
  if (axes.lieu.slug !== 'france') return 'geographic';
  if (axes.themes.length > 0) return 'thematic';
  return 'best_of';
}

function buildKeywords(axes: RankingAxes, lieu: LieuDef | null): string[] {
  const out: string[] = [];
  out.push(`Lieu : ${lieu?.label ?? axes.lieu.label} (${axes.lieu.scope})`);
  if (axes.types.length > 0) {
    out.push(`Types ciblés : ${axes.types.join(', ')}`);
  }
  if (axes.themes.length > 0) {
    out.push(`Thématiques : ${axes.themes.join(', ')}`);
  }
  if (axes.occasions.length > 0) {
    out.push(`Occasions : ${axes.occasions.join(', ')}`);
  }
  if (axes.saison !== 'toute-annee') {
    out.push(`Saison : ${axes.saison}`);
  }
  return out;
}

interface BuildSeedInput {
  readonly axes: RankingAxes;
  readonly source: MatrixSource;
  readonly catalog: ReadonlyArray<HotelCatalogRow>;
  readonly yonderSlug?: string | null;
  readonly yonderTitle?: string | null;
  readonly slugOverride?: string | null;
  readonly titleFrOverride?: string | null;
  readonly titleEnOverride?: string | null;
}

function buildSeed(input: BuildSeedInput): MatrixSeed | null {
  const rendered = renderRanking(input.axes);
  if (rendered === null && input.slugOverride === undefined) return null;

  const slug = input.slugOverride ?? rendered!.slug;
  const titleFr = input.titleFrOverride ?? rendered!.titleFr;
  const titleEn = input.titleEnOverride ?? rendered!.titleEn;
  const templateKey = rendered?.templateKey ?? 'manual';

  const predicate = eligibilityFor(input.axes);
  const eligibleHotelIds: string[] = [];
  for (const h of input.catalog) {
    if (predicate(h)) eligibleHotelIds.push(h.id);
  }

  const lieu = resolveLieu(input.axes.lieu.slug);
  const seed: MatrixSeed = {
    slug,
    titleFr,
    titleEn,
    axes: input.axes,
    source: input.source,
    templateKey,
    targetLength: targetLengthFor(input.axes, eligibleHotelIds.length),
    eligibleCount: eligibleHotelIds.length,
    eligibleHotelIds,
    hasEnoughCandidates: eligibleHotelIds.length >= MIN_ELIGIBLE,
    yonderSlug: input.yonderSlug ?? null,
    yonderTitle: input.yonderTitle ?? null,
    keywordsFr: buildKeywords(input.axes, lieu),
    kind: kindFor(input.axes),
  };
  return seed;
}

// ─── Manual high-volume overrides ────────────────────────────────────────

/**
 * Tops we always want to ship, even if the algorithm wouldn't pick
 * them up (or if the slug differs from the canonical template). One
 * entry = one ranking guaranteed in the matrice. Order matters only
 * for ties on slug collisions (manual wins).
 */
interface ManualOverride {
  readonly slug: string;
  readonly titleFr: string;
  readonly titleEn: string;
  readonly axes: RankingAxes;
  readonly kind?: MatrixSeed['kind'];
}

const MANUAL_OVERRIDES: readonly ManualOverride[] = [
  // Pillar national rankings — high volume search.
  {
    slug: 'meilleurs-palaces-france',
    titleFr: 'Les meilleurs Palaces de France',
    titleEn: 'The best Palaces in France',
    axes: {
      types: ['palace'],
      lieu: { scope: 'france', slug: 'france', label: 'France' },
      themes: [],
      occasions: [],
      saison: 'toute-annee',
    },
  },
  {
    slug: 'plus-beaux-hotels-5-etoiles-france',
    titleFr: 'Les plus beaux hôtels 5 étoiles de France',
    titleEn: 'The most beautiful 5-star hotels in France',
    axes: {
      types: ['5-etoiles'],
      lieu: { scope: 'france', slug: 'france', label: 'France' },
      themes: [],
      occasions: [],
      saison: 'toute-annee',
    },
  },
  {
    slug: 'plus-beaux-hotels-france',
    titleFr: 'Les 30 plus beaux hôtels de France',
    titleEn: 'The 30 most beautiful hotels in France',
    axes: {
      types: ['all'],
      lieu: { scope: 'france', slug: 'france', label: 'France' },
      themes: [],
      occasions: [],
      saison: 'toute-annee',
    },
  },

  // Pillar Paris.
  {
    slug: 'meilleurs-palaces-paris',
    titleFr: 'Les meilleurs Palaces de Paris',
    titleEn: 'The best Palaces in Paris',
    axes: {
      types: ['palace'],
      lieu: { scope: 'ville', slug: 'paris', label: 'Paris' },
      themes: [],
      occasions: [],
      saison: 'toute-annee',
    },
  },

  // Pillar Côte d'Azur / Riviera.
  {
    slug: 'meilleurs-palaces-cote-d-azur',
    titleFr: "Les meilleurs Palaces de la Côte d'Azur",
    titleEn: 'The best Palaces on the French Riviera',
    axes: {
      types: ['palace'],
      lieu: { scope: 'cluster', slug: 'cote-d-azur', label: "Côte d'Azur" },
      themes: [],
      occasions: [],
      saison: 'toute-annee',
    },
  },

  // Alpes / ski.
  {
    slug: 'meilleurs-palaces-alpes',
    titleFr: 'Les plus beaux Palaces des Alpes',
    titleEn: 'The most beautiful Palaces in the French Alps',
    axes: {
      types: ['palace'],
      lieu: { scope: 'cluster', slug: 'alpes', label: 'Alpes' },
      themes: ['montagne', 'sport-ski'],
      occasions: [],
      saison: 'hiver',
    },
  },
  {
    slug: 'plus-beaux-hotels-courchevel',
    titleFr: 'Les plus beaux hôtels de Courchevel',
    titleEn: 'The most beautiful hotels in Courchevel',
    axes: {
      types: ['all'],
      lieu: { scope: 'station', slug: 'courchevel', label: 'Courchevel' },
      themes: [],
      occasions: [],
      saison: 'hiver',
    },
  },

  // Thematic high-volume.
  {
    slug: 'palaces-spa-bien-etre',
    titleFr: 'Les Palaces avec spa pour une retraite bien-être',
    titleEn: 'Palaces with spa for a wellness retreat',
    axes: {
      types: ['palace'],
      lieu: { scope: 'france', slug: 'france', label: 'France' },
      themes: ['spa-bienetre'],
      occasions: [],
      saison: 'toute-annee',
    },
    kind: 'thematic',
  },
  {
    slug: 'palaces-romantiques-france',
    titleFr: 'Les Palaces les plus romantiques de France',
    titleEn: 'The most romantic Palaces in France',
    axes: {
      types: ['palace'],
      lieu: { scope: 'france', slug: 'france', label: 'France' },
      themes: ['romantique'],
      occasions: ['lune-de-miel'],
      saison: 'toute-annee',
    },
    kind: 'thematic',
  },
  {
    slug: 'palaces-gastronomie-michelin',
    titleFr: 'Les Palaces de France avec les plus belles tables gastronomiques',
    titleEn: 'The finest gastronomic Palaces in France',
    axes: {
      types: ['palace'],
      lieu: { scope: 'france', slug: 'france', label: 'France' },
      themes: ['gastronomie'],
      occasions: [],
      saison: 'toute-annee',
    },
    kind: 'awarded',
  },
  {
    slug: 'palaces-bord-de-mer',
    titleFr: 'Les plus beaux Palaces en bord de mer',
    titleEn: 'The most beautiful seaside Palaces',
    axes: {
      types: ['palace'],
      lieu: { scope: 'france', slug: 'france', label: 'France' },
      themes: ['mer'],
      occasions: [],
      saison: 'ete',
    },
    kind: 'thematic',
  },
  {
    slug: 'palaces-vignobles',
    titleFr: 'Les plus beaux Palaces et Resorts au cœur des vignobles',
    titleEn: 'The most beautiful Palaces and Resorts in the vineyards',
    axes: {
      types: ['palace'],
      lieu: { scope: 'france', slug: 'france', label: 'France' },
      themes: ['vignobles'],
      occasions: [],
      saison: 'automne',
    },
    kind: 'thematic',
  },
  {
    slug: 'palaces-familles',
    titleFr: 'Les Palaces les plus adaptés aux familles',
    titleEn: 'The best Palaces for families',
    axes: {
      types: ['palace'],
      lieu: { scope: 'france', slug: 'france', label: 'France' },
      themes: ['famille'],
      occasions: [],
      saison: 'toute-annee',
    },
    kind: 'thematic',
  },
];

// ─── Combinator entry point ──────────────────────────────────────────────

export interface BuildMatrixOptions {
  /** Hotels catalog (output of list-hotels-for-rankings.ts). */
  readonly catalog: ReadonlyArray<HotelCatalogRow>;
  /** Classified yonder Tops (output of classify-yonder-axes.ts). */
  readonly yonderClassified: ReadonlyArray<{
    readonly slug: string;
    readonly title: string;
    readonly axes: RankingAxes;
    readonly lieuResolved: boolean;
  }>;
  /** When false, emit even seeds with < MIN_ELIGIBLE candidates (for QA). */
  readonly skipUnderfilled?: boolean;
}

export interface BuildMatrixResult {
  readonly seeds: readonly MatrixSeed[];
  readonly stats: {
    readonly totalCandidates: number;
    readonly emittedSeeds: number;
    readonly droppedUnderfilled: number;
    readonly bySource: Readonly<Record<MatrixSource, number>>;
    readonly byTemplate: Readonly<Record<string, number>>;
  };
}

export function buildMatrix(options: BuildMatrixOptions): BuildMatrixResult {
  const { catalog, yonderClassified, skipUnderfilled = false } = options;
  const seedsBySlug = new Map<string, MatrixSeed>();
  let droppedUnderfilled = 0;
  let totalCandidates = 0;

  // 1. Manual overrides — highest priority. Always emitted (even
  //    when underfilled) because they're flagship pages we need.
  for (const m of MANUAL_OVERRIDES) {
    totalCandidates += 1;
    const seed = buildSeed({
      axes: m.axes,
      source: 'manual',
      catalog,
      slugOverride: m.slug,
      titleFrOverride: m.titleFr,
      titleEnOverride: m.titleEn,
    });
    if (seed === null) continue;
    const final: MatrixSeed = m.kind ? { ...seed, kind: m.kind } : seed;
    seedsBySlug.set(m.slug, final);
  }

  // 2. Yonder mirrors — only when the lieu was resolved (otherwise
  //    we cannot map to our hotels DB) and the template renders.
  for (const y of yonderClassified) {
    if (!y.lieuResolved) continue;
    totalCandidates += 1;
    const seed = buildSeed({
      axes: y.axes,
      source: 'yonder',
      catalog,
      yonderSlug: y.slug,
      yonderTitle: y.title,
    });
    if (seed === null) continue;
    if (seedsBySlug.has(seed.slug)) continue; // manual already won
    if (skipUnderfilled && !seed.hasEnoughCandidates) {
      droppedUnderfilled += 1;
      continue;
    }
    seedsBySlug.set(seed.slug, seed);
  }

  // 3. Auto matrix — full Cartesian product (type × lieu) +
  //    (theme × lieu) + (theme × france). We intentionally cap the
  //    explosion by NOT generating type × theme × occasion at this
  //    layer (templates handle that for yonder mirrors only).
  for (const lieu of LIEUX) {
    if (lieu.slug === 'monde') continue;
    for (const t of HOTEL_TYPES) {
      if (t === 'all') continue;
      const axes: RankingAxes = {
        types: [t],
        lieu: { scope: lieu.scope, slug: lieu.slug, label: lieu.label },
        themes: [],
        occasions: [],
        saison: 'toute-annee',
      };
      totalCandidates += 1;
      const seed = buildSeed({ axes, source: 'auto', catalog });
      if (seed === null) continue;
      if (seedsBySlug.has(seed.slug)) continue;
      if (skipUnderfilled && !seed.hasEnoughCandidates) {
        droppedUnderfilled += 1;
        continue;
      }
      seedsBySlug.set(seed.slug, seed);
    }
  }

  // 4. Theme × Lieu (type=all).
  for (const lieu of LIEUX) {
    if (lieu.slug === 'monde') continue;
    for (const th of THEMES) {
      const axes: RankingAxes = {
        types: ['all'],
        lieu: { scope: lieu.scope, slug: lieu.slug, label: lieu.label },
        themes: [th],
        occasions: [],
        saison: 'toute-annee',
      };
      totalCandidates += 1;
      const seed = buildSeed({ axes, source: 'auto', catalog });
      if (seed === null) continue;
      if (seedsBySlug.has(seed.slug)) continue;
      if (skipUnderfilled && !seed.hasEnoughCandidates) {
        droppedUnderfilled += 1;
        continue;
      }
      seedsBySlug.set(seed.slug, seed);
    }
  }

  // 5. Occasion × France (type=all). Few but high-volume terms.
  for (const o of OCCASIONS) {
    const axes: RankingAxes = {
      types: ['all'],
      lieu: { scope: 'france', slug: 'france', label: 'France' },
      themes: [],
      occasions: [o],
      saison: 'toute-annee',
    };
    totalCandidates += 1;
    const seed = buildSeed({ axes, source: 'auto', catalog });
    if (seed === null) continue;
    if (seedsBySlug.has(seed.slug)) continue;
    if (skipUnderfilled && !seed.hasEnoughCandidates) {
      droppedUnderfilled += 1;
      continue;
    }
    seedsBySlug.set(seed.slug, seed);
  }

  const seeds = [...seedsBySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug));

  const bySource: Record<MatrixSource, number> = { auto: 0, yonder: 0, manual: 0 };
  const byTemplate: Record<string, number> = {};
  for (const s of seeds) {
    bySource[s.source] += 1;
    byTemplate[s.templateKey] = (byTemplate[s.templateKey] ?? 0) + 1;
  }

  return {
    seeds,
    stats: {
      totalCandidates,
      emittedSeeds: seeds.length,
      droppedUnderfilled,
      bySource,
      byTemplate,
    },
  };
}

// Re-export utilities used downstream.
export { renderRanking };
export type { RenderedRankingSeed };

// Quick helper for the CLI to filter "ready to generate" seeds.
export function readySeeds(seeds: ReadonlyArray<MatrixSeed>): MatrixSeed[] {
  return seeds.filter((s) => s.hasEnoughCandidates);
}

/** For UI: group seeds by lieu/scope (used by the facetted hub later). */
export function bucketByLieu(
  seeds: ReadonlyArray<MatrixSeed>,
): ReadonlyMap<string, ReadonlyArray<MatrixSeed>> {
  const out = new Map<string, MatrixSeed[]>();
  for (const s of seeds) {
    const k = s.axes.lieu.slug;
    const list = out.get(k) ?? [];
    list.push(s);
    out.set(k, list);
  }
  return out;
}
