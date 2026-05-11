import { NextResponse } from 'next/server';

import { buildSitemapXml, type SitemapEntry } from '@cct/seo';

import { env } from '@/lib/env';
import { listPublishedRoomSlugs } from '@/server/hotels/get-room-by-slug';

export const revalidate = 3600;

const FALLBACK_SITE_URL = 'https://conciergetravel.fr';

function siteOrigin(): string {
  return (env.NEXT_PUBLIC_SITE_URL ?? FALLBACK_SITE_URL).replace(/\/$/, '');
}

/**
 * Room sub-pages sub-sitemap (skill: seo-technical).
 *
 * Emits one entry per published `(hotel_slug, room_slug)` tuple — i.e. every
 * URL served by `/[locale]/hotel/[slug]/chambres/[roomSlug]`. FR + EN
 * alternates included. `changefreq=monthly` (room descriptions are stable
 * after publication) and `priority=0.6` (subordinate to the parent fiche).
 *
 * Returns an empty `<urlset>` on read error so the route never 500s.
 */
export async function GET(): Promise<NextResponse> {
  const origin = siteOrigin();
  let entries: SitemapEntry[] = [];

  try {
    const rooms = await listPublishedRoomSlugs();
    for (const r of rooms) {
      const enHotelSlug = r.hotelSlugEn ?? r.hotelSlugFr;
      const frUrl = `${origin}/hotel/${r.hotelSlugFr}/chambres/${r.roomSlug}`;
      const enUrl = `${origin}/en/hotel/${enHotelSlug}/chambres/${r.roomSlug}`;
      entries.push({
        loc: frUrl,
        changefreq: 'monthly',
        priority: 0.6,
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
