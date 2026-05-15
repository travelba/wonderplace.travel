import { NextResponse } from 'next/server';

import { buildSitemapIndexXml } from '@cct/seo';

import { env } from '@/lib/env';

export const dynamic = 'force-static';
export const revalidate = 3600;

const FALLBACK_SITE_URL = 'https://conciergetravel.fr';

/**
 * Sitemap index (skill: seo-technical). Sub-sitemaps are emitted by
 * `/sitemaps/{hotels,rooms,hubs,editorial,guides}.xml`.
 *
 * IMPORTANT: This route is `force-static`. Reading `new URL(request.url).origin`
 * here would bake the build-time origin (typically `http://localhost:3000`)
 * into the deployed file. We instead read the canonical site URL from
 * validated env so the deployed sitemap always points at the production
 * domain. Sub-sitemap routes follow the same pattern.
 */
export function GET(): NextResponse {
  const origin = (env.NEXT_PUBLIC_SITE_URL ?? FALLBACK_SITE_URL).replace(/\/$/, '');
  const now = new Date().toISOString();
  const xml = buildSitemapIndexXml([
    { loc: `${origin}/sitemaps/hotels.xml`, lastmod: now },
    { loc: `${origin}/sitemaps/rooms.xml`, lastmod: now },
    { loc: `${origin}/sitemaps/hubs.xml`, lastmod: now },
    { loc: `${origin}/sitemaps/editorial.xml`, lastmod: now },
    { loc: `${origin}/sitemaps/guides.xml`, lastmod: now },
    { loc: `${origin}/sitemaps/rankings.xml`, lastmod: now },
  ]);
  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  });
}
