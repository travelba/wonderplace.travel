import { NextResponse } from 'next/server';

export const dynamic = 'force-static';
export const revalidate = 3600;

/**
 * Sitemap index. Sub-sitemaps generated per content type in Phase 9
 * (cf. seo-technical skill). For now we expose a minimal index pointing at
 * placeholder sub-sitemaps.
 */
export function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const now = new Date().toISOString();

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>${origin}/sitemaps/hotels.xml</loc><lastmod>${now}</lastmod></sitemap>
  <sitemap><loc>${origin}/sitemaps/hubs.xml</loc><lastmod>${now}</lastmod></sitemap>
  <sitemap><loc>${origin}/sitemaps/editorial.xml</loc><lastmod>${now}</lastmod></sitemap>
  <sitemap><loc>${origin}/sitemaps/guides.xml</loc><lastmod>${now}</lastmod></sitemap>
</sitemapindex>`;

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  });
}
