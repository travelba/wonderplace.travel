import type { AlgoliaHotelRecord, HotelSourceRow } from './types.js';
import type { SearchLocale } from './index-names.js';

const EXCERPT_LEN = 200;
const AMENITIES_TOP = 10;
const THEMES_MAX = 20;

export function priorityScore(priority: HotelSourceRow['priority']): number {
  switch (priority) {
    case 'P0':
      return 100;
    case 'P1':
      return 70;
    case 'P2':
      return 40;
  }
}

function excerpt(raw: string | null | undefined): string {
  if (raw === null || raw === undefined) return '';
  const t = raw.replace(/\s+/g, ' ').trim();
  if (t.length <= EXCERPT_LEN) return t;
  return `${t.slice(0, EXCERPT_LEN)}…`;
}

function parseGoogleRating(raw: HotelSourceRow['google_rating']): number | undefined {
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function amenitiesTopList(raw: unknown): string[] {
  if (raw === undefined || raw === null) return [];
  if (Array.isArray(raw)) {
    const out: string[] = [];
    for (const item of raw) {
      if (typeof item === 'string' && item.length > 0) {
        out.push(item);
      } else if (item !== null && typeof item === 'object' && 'label' in item) {
        const label = (item as { label?: unknown }).label;
        if (typeof label === 'string' && label.length > 0) out.push(label);
      }
      if (out.length >= AMENITIES_TOP) break;
    }
    return out;
  }
  if (typeof raw === 'object') {
    return Object.keys(raw as Record<string, unknown>)
      .filter((k) => k.length > 0)
      .slice(0, AMENITIES_TOP);
  }
  return [];
}

function themesList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is string => typeof item === 'string' && item.length > 0)
    .slice(0, THEMES_MAX);
}

export function buildHotelAlgoliaRecord(
  locale: SearchLocale,
  row: HotelSourceRow,
): AlgoliaHotelRecord {
  const name =
    locale === 'fr'
      ? row.name
      : row.name_en !== null && row.name_en !== undefined && row.name_en !== ''
        ? row.name_en
        : row.name;
  const slug =
    locale === 'en'
      ? row.slug_en !== null && row.slug_en !== undefined && row.slug_en !== ''
        ? row.slug_en
        : row.slug
      : row.slug;
  const descSource =
    locale === 'fr' ? row.description_fr : (row.description_en ?? row.description_fr);
  const district =
    row.district !== null && row.district !== undefined && row.district !== ''
      ? row.district
      : undefined;
  // Unlocalized path. The renderer (next-intl Link / metadata helpers) is
  // responsible for prepending `/en` when needed. Slug is locale-specific.
  const urlPath = `/hotel/${slug}`;

  const base: AlgoliaHotelRecord = {
    objectID: row.id,
    name,
    city: row.city,
    region: row.region,
    description_excerpt: excerpt(descSource),
    amenities_top: amenitiesTopList(row.amenities),
    themes: themesList(row.highlights),
    slug,
    url_path: urlPath,
    is_palace: row.is_palace,
    stars: row.stars,
    is_little_catalog: row.is_little_catalog,
    priority: row.priority,
    priority_score: priorityScore(row.priority),
    google_rating: parseGoogleRating(row.google_rating),
    google_reviews_count: row.google_reviews_count ?? undefined,
  };

  if (district !== undefined) {
    return { ...base, district };
  }

  return base;
}
