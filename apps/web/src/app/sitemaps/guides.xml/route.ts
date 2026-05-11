import { NextResponse } from 'next/server';

import { buildSitemapXml } from '@cct/seo';

export const dynamic = 'force-static';
export const revalidate = 3600;

/** Editorial guides sub-sitemap. See `sitemaps/hotels.xml/route.ts`. */
export function GET(): NextResponse {
  const xml = buildSitemapXml([]);
  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  });
}
