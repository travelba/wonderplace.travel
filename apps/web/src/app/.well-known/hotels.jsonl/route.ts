import { NextResponse } from 'next/server';

import { env } from '@/lib/env';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * /.well-known/hotels.jsonl — machine-readable catalog of published
 * hotels, one JSON object per line (JSONL aka NDJSON). Designed for
 * LLM agents and AI search engines (Perplexity, ChatGPT Search,
 * Claude with Atlas, Gemini Deep Research…) that prefer streaming-
 * friendly data formats over crawl-and-parse HTML.
 *
 * Why JSONL (not JSON array) ?
 *   - Streamable: an agent can parse N rows without loading the whole
 *     payload — important when our catalog grows to 100+ hotels.
 *   - One row per line: trivially diffable, log-friendly, greppable.
 *   - Same convention as `llms-full.txt` companions.
 *
 * Headers:
 *   - `Content-Type: application/x-ndjson` (canonical NDJSON MIME).
 *   - `Cache-Control: public, max-age=300, s-maxage=3600` so the CDN
 *     keeps a hot copy but client UAs refresh every 5 min.
 *   - `Access-Control-Allow-Origin: *` for cross-origin LLM crawlers.
 *
 * Per-row schema (stable contract — extend additively only):
 *   id, slug, slug_en, name, name_en, stars, is_palace, city, region,
 *   country, country_code, latitude, longitude, address, postal_code,
 *   url, url_en, hero_image (Cloudinary public_id), summary_fr,
 *   summary_en, booking_mode, has_palace_distinction, updated_at,
 *   schema_org_type ("LodgingBusiness" | "Hotel"),
 *   external_ids: { wikidata, wikipedia_fr, wikipedia_en, tripadvisor,
 *                   booking_com, google_maps_cid, official_url }.
 *
 * Skill: geo-llm-optimization §Machine-readable surfaces.
 */

export const dynamic = 'force-dynamic';
export const revalidate = 600;

const FALLBACK_SITE_URL = 'https://conciergetravel.fr';

function siteOrigin(): string {
  return (env.NEXT_PUBLIC_SITE_URL ?? FALLBACK_SITE_URL).replace(/\/$/, '');
}

function safeString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function safeNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function safeBool(v: unknown): boolean {
  return v === true;
}

export async function GET(): Promise<Response> {
  const origin = siteOrigin();
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('hotels')
    .select(
      'id, slug, slug_en, name, name_en, stars, is_palace, city, region, ' +
        'latitude, longitude, address, postal_code, hero_image, ' +
        'description_fr, description_en, booking_mode, updated_at, ' +
        'wikidata_id, wikipedia_url_fr, wikipedia_url_en, tripadvisor_location_id, ' +
        'booking_com_hotel_id, official_url',
    )
    .eq('is_published', true)
    .order('is_palace', { ascending: false })
    .order('stars', { ascending: false })
    .order('name', { ascending: true });

  if (error !== null || data === null) {
    return new Response('Error reading hotel catalog\n', {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const lines: string[] = [];
  for (const row of data as unknown[]) {
    const r = row as Record<string, unknown>;
    const slug = safeString(r['slug']);
    const slugEn = safeString(r['slug_en']);
    const name = safeString(r['name']);
    if (slug === null || name === null) continue;
    const summaryFr = safeString(r['description_fr']);
    const summaryEn = safeString(r['description_en']);
    const stars = safeNumber(r['stars']);
    const isPalace = safeBool(r['is_palace']);
    const obj = {
      id: safeString(r['id']),
      slug,
      slug_en: slugEn,
      name,
      name_en: safeString(r['name_en']),
      stars: stars ?? null,
      is_palace: isPalace,
      schema_org_type: 'LodgingBusiness' as const,
      city: safeString(r['city']),
      region: safeString(r['region']),
      country: 'France',
      country_code: 'FR',
      address: safeString(r['address']),
      postal_code: safeString(r['postal_code']),
      latitude: safeNumber(r['latitude']),
      longitude: safeNumber(r['longitude']),
      url: `${origin}/hotel/${slug}`,
      url_en: slugEn !== null ? `${origin}/en/hotel/${slugEn}` : null,
      hero_image: safeString(r['hero_image']),
      summary_fr: summaryFr,
      summary_en: summaryEn,
      booking_mode: safeString(r['booking_mode']),
      has_palace_distinction: isPalace,
      updated_at: safeString(r['updated_at']),
      external_ids: {
        wikidata: safeString(r['wikidata_id']),
        wikipedia_fr: safeString(r['wikipedia_url_fr']),
        wikipedia_en: safeString(r['wikipedia_url_en']),
        tripadvisor: safeString(r['tripadvisor_location_id']),
        booking_com: safeString(r['booking_com_hotel_id']),
        official_url: safeString(r['official_url']),
      },
    };
    lines.push(JSON.stringify(obj));
  }

  const body = lines.join('\n') + '\n';
  return new Response(body, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=3600',
      'Access-Control-Allow-Origin': '*',
      'X-Catalog-Count': String(lines.length),
    },
  });
}
