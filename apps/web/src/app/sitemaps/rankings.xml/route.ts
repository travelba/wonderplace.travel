import { NextResponse } from 'next/server';

import { buildSitemapXml, type SitemapEntry } from '@cct/seo';

import { env } from '@/lib/env';
import { listPublishedRankings } from '@/server/rankings/get-ranking-by-slug';

export const revalidate = 3600;

const FALLBACK_SITE_URL = 'https://conciergetravel.fr';

function siteOrigin(): string {
  return (env.NEXT_PUBLIC_SITE_URL ?? FALLBACK_SITE_URL).replace(/\/$/, '');
}

/**
 * Rankings sub-sitemap (plan rankings-parity-yonder WS2.5 v5,
 * skill: seo-technical).
 *
 * Emits:
 *   - One entry per published ranking detail page, with FR + EN
 *     alternates and the row's `updated_at` as `lastmod` (triple
 *     freshness sync with `LastUpdatedBadge` + JSON-LD `dateModified`).
 *   - One entry per discoverable sub-hub (`/classements/[axe]/[valeur]`)
 *     so Google indexes our facetted axes.
 *
 * Defensive try/catch keeps the route from 500-ing when Supabase
 * is degraded; an empty `<urlset>` is preferable to a missing file.
 */
export async function GET(): Promise<NextResponse> {
  const origin = siteOrigin();
  let entries: SitemapEntry[] = [];

  try {
    const rankings = await listPublishedRankings();

    // Detail pages — one entry per ranking.
    for (const r of rankings) {
      const frUrl = `${origin}/classement/${r.slug}`;
      const enUrl = `${origin}/en/classement/${r.slug}`;
      const lastmod = r.updatedAt ?? undefined;
      entries.push({
        loc: frUrl,
        ...(lastmod !== undefined ? { lastmod } : {}),
        changefreq: 'weekly',
        priority: 0.7,
        alternates: [
          { hreflang: 'fr-FR', href: frUrl },
          { hreflang: 'en', href: enUrl },
          { hreflang: 'x-default', href: frUrl },
        ],
      });
    }

    // Hub.
    entries.push({
      loc: `${origin}/classements`,
      changefreq: 'daily',
      priority: 0.8,
      alternates: [
        { hreflang: 'fr-FR', href: `${origin}/classements` },
        { hreflang: 'en', href: `${origin}/en/classements` },
        { hreflang: 'x-default', href: `${origin}/classements` },
      ],
    });

    // Sub-hubs — derived from the axes payloads.
    const seenSubhubs = new Set<string>();
    const pushSubhub = (axe: string, valeur: string): void => {
      const key = `${axe}/${valeur}`;
      if (seenSubhubs.has(key)) return;
      seenSubhubs.add(key);
      const path = `/classements/${axe}/${valeur}`;
      entries.push({
        loc: `${origin}${path}`,
        changefreq: 'weekly',
        priority: 0.6,
        alternates: [
          { hreflang: 'fr-FR', href: `${origin}${path}` },
          { hreflang: 'en', href: `${origin}/en${path}` },
          { hreflang: 'x-default', href: `${origin}${path}` },
        ],
      });
    };
    for (const r of rankings) {
      for (const ty of r.axes.types) pushSubhub('type', ty);
      for (const th of r.axes.themes) pushSubhub('theme', th);
      for (const o of r.axes.occasions) pushSubhub('occasion', o);
      if (r.axes.lieu !== undefined) pushSubhub('lieu', r.axes.lieu.slug);
    }
  } catch {
    entries = [];
  }

  const xml = buildSitemapXml(entries);
  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  });
}
