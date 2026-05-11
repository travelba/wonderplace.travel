import { NextResponse } from 'next/server';

import { buildSitemapXml, type SitemapEntry } from '@cct/seo';

import { env } from '@/lib/env';
import { listPublishedCities } from '@/server/destinations/cities';

// ISR — fetches the destination directory at build, then revalidates hourly.
export const revalidate = 3600;

const FALLBACK_SITE_URL = 'https://conciergetravel.fr';

function siteOrigin(): string {
  return (env.NEXT_PUBLIC_SITE_URL ?? FALLBACK_SITE_URL).replace(/\/$/, '');
}

/**
 * Hub sub-sitemap (skill: seo-technical).
 * Emits the `/destination` directory plus one entry per destination
 * (`/destination/<slug>`) with FR + EN alternates. Weekly changefreq —
 * the catalog evolves slowly.
 */
export async function GET(): Promise<NextResponse> {
  const origin = siteOrigin();
  let entries: SitemapEntry[] = [];

  try {
    const cities = await listPublishedCities();

    const directoryFr = `${origin}/destination`;
    const directoryEn = `${origin}/en/destination`;
    entries.push({
      loc: directoryFr,
      changefreq: 'weekly',
      priority: 0.6,
      alternates: [
        { hreflang: 'fr-FR', href: directoryFr },
        { hreflang: 'en', href: directoryEn },
        { hreflang: 'x-default', href: directoryFr },
      ],
    });

    for (const c of cities) {
      const fr = `${origin}/destination/${c.slug}`;
      const en = `${origin}/en/destination/${c.slug}`;
      entries.push({
        loc: fr,
        changefreq: 'weekly',
        priority: 0.7,
        alternates: [
          { hreflang: 'fr-FR', href: fr },
          { hreflang: 'en', href: en },
          { hreflang: 'x-default', href: fr },
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
