import { NextResponse } from 'next/server';

import { buildSitemapIndexXml } from '@cct/seo';

export const dynamic = 'force-static';
export const revalidate = 3600;

/**
 * Sitemap index (skill: seo-technical). Sub-sitemaps are emitted by
 * `/sitemaps/{hotels,hubs,editorial,guides}.xml`. Each starts empty until
 * Phase 8 wires Payload data, but always returns a valid `urlset`.
 */
export function GET(request: Request): NextResponse {
  const origin = new URL(request.url).origin;
  const now = new Date().toISOString();
  const xml = buildSitemapIndexXml([
    { loc: `${origin}/sitemaps/hotels.xml`, lastmod: now },
    { loc: `${origin}/sitemaps/rooms.xml`, lastmod: now },
    { loc: `${origin}/sitemaps/hubs.xml`, lastmod: now },
    { loc: `${origin}/sitemaps/editorial.xml`, lastmod: now },
    { loc: `${origin}/sitemaps/guides.xml`, lastmod: now },
  ]);
  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  });
}
