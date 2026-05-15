import { NextResponse } from 'next/server';

import { buildSitemapXml, type SitemapEntry } from '@cct/seo';

import { env } from '@/lib/env';
import { listIndexableHotelSlugs } from '@/server/hotels/get-hotel-by-slug';

// ISR — fetches the published catalog at build, then revalidates hourly.
export const revalidate = 3600;

const FALLBACK_SITE_URL = 'https://conciergetravel.fr';

function siteOrigin(): string {
  return (env.NEXT_PUBLIC_SITE_URL ?? FALLBACK_SITE_URL).replace(/\/$/, '');
}

/**
 * Hotels sub-sitemap (skill: seo-technical).
 * Emits one entry per published hotel slug with FR + EN alternates and a
 * weekly changefreq. Falls back to an empty `<urlset>` on any read error.
 */
export async function GET(): Promise<NextResponse> {
  const origin = siteOrigin();
  let entries: SitemapEntry[] = [];

  try {
    // Indexable only — exclude catalog stubs (noindex on the page).
    const slugs = await listIndexableHotelSlugs();
    for (const s of slugs) {
      const enSlug = s.slugEn ?? s.slugFr;
      const frUrl = `${origin}/hotel/${s.slugFr}`;
      const enUrl = `${origin}/en/hotel/${enSlug}`;
      entries.push({
        loc: frUrl,
        changefreq: 'weekly',
        priority: 0.8,
        alternates: [
          { hreflang: 'fr-FR', href: frUrl },
          { hreflang: 'en', href: enUrl },
          { hreflang: 'x-default', href: frUrl },
        ],
      });
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
