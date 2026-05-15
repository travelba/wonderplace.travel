/**
 * rankings-catalog-v2.ts — programmatic catalog of ALL ranking seeds
 * (~200 entries). Replaces the hand-curated list in
 * `rankings-catalog.ts` (which we keep as a reference for the v1
 * pipeline).
 *
 * The list is built lazily by `loadRankingsV2()` from:
 *   - `out/hotels-catalog.json` (hotels DB snapshot)
 *   - `data/yonder-tops-fr-classified.json` (yonder Tops we mirror)
 *
 * Building lazily means:
 *   - The catalog auto-grows when new hotels are added to Supabase.
 *   - Re-running `pnpm exec tsx src/guides/list-hotels-for-rankings.ts`
 *     refreshes both the catalog snapshot AND any downstream
 *     eligibility computation.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadHotelsCatalog, type HotelCatalogRow } from './load-hotels-catalog.js';
import { buildMatrix, type BuildMatrixResult, type MatrixSeed } from './combinator.js';
import { RankingAxesSchema, type RankingAxes } from './axes.js';
import type { RankingSeed } from './rankings-catalog.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLASSIFIED_PATH = path.resolve(__dirname, '../../data/yonder-tops-fr-classified.json');

// ─── Yonder loader ───────────────────────────────────────────────────────

interface ClassifiedYonderEntry {
  readonly slug: string;
  readonly title: string;
  readonly axes: RankingAxes;
  readonly lieuResolved: boolean;
}

async function loadYonderClassified(): Promise<ClassifiedYonderEntry[]> {
  let raw: string;
  try {
    raw = await fs.readFile(CLASSIFIED_PATH, 'utf-8');
  } catch {
    return [];
  }
  const parsed = JSON.parse(raw) as { entries: ReadonlyArray<unknown> };
  const out: ClassifiedYonderEntry[] = [];
  for (const e of parsed.entries) {
    if (typeof e !== 'object' || e === null) continue;
    const obj = e as Record<string, unknown>;
    const axesRes = RankingAxesSchema.safeParse(obj['axes']);
    if (!axesRes.success) continue;
    out.push({
      slug: String(obj['slug'] ?? ''),
      title: String(obj['title'] ?? ''),
      axes: axesRes.data,
      lieuResolved: Boolean(obj['lieuResolved']),
    });
  }
  return out;
}

// ─── Public API ──────────────────────────────────────────────────────────

export interface LoadedRankingsV2 {
  readonly catalog: ReadonlyArray<HotelCatalogRow>;
  readonly matrix: BuildMatrixResult;
  readonly seedsAsRankingSeeds: ReadonlyArray<RankingSeed>;
}

/**
 * Loads everything needed to drive the v2 generator. Returns the
 * raw matrix (with stats) AND the seeds shaped as `RankingSeed[]`
 * so they're a drop-in replacement for the v1 catalog.
 *
 * Use `options.skipUnderfilled = true` to exclude seeds with fewer
 * than the eligibility floor — the default for production runs.
 */
export async function loadRankingsV2(
  options: { readonly skipUnderfilled?: boolean } = {},
): Promise<LoadedRankingsV2> {
  const catalog = await loadHotelsCatalog();
  const yonderClassified = await loadYonderClassified();
  const matrix = buildMatrix({
    catalog,
    yonderClassified,
    skipUnderfilled: options.skipUnderfilled ?? true,
  });
  const seedsAsRankingSeeds = matrix.seeds.map(matrixSeedToRankingSeed);
  return { catalog, matrix, seedsAsRankingSeeds };
}

/** Convert a MatrixSeed into the v1 RankingSeed shape consumed by `generate-ranking-v2.ts`. */
export function matrixSeedToRankingSeed(seed: MatrixSeed): RankingSeed {
  const eligibleSet = new Set(seed.eligibleHotelIds);
  return {
    slug: seed.slug,
    titleFr: seed.titleFr,
    titleEn: seed.titleEn,
    kind: seed.kind,
    targetLength: seed.targetLength,
    keywordsFr: seed.keywordsFr,
    eligibility: (h) => eligibleSet.has(h.id),
  };
}
