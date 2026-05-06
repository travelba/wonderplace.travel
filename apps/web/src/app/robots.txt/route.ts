import { NextResponse } from 'next/server';

export const dynamic = 'force-static';
export const revalidate = 86400;

/**
 * robots.txt — generated dynamically so the SEO team can override allow/disallow
 * via Payload `RobotsConfig` global. Skill: seo-technical, geo-llm-optimization.
 */
export function GET(request: Request) {
  const origin = new URL(request.url).origin;

  const lines: string[] = [
    '# ConciergeTravel.fr — robots.txt',
    '# Authorize Google + OpenAI + Perplexity + Anthropic + Apple LLM crawlers (cf. CDC §6.5)',
    '',
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    'Disallow: /admin/',
    'Disallow: /fr/reservation/',
    'Disallow: /en/reservation/',
    'Disallow: /fr/compte/',
    'Disallow: /en/compte/',
    'Disallow: /fr/auth/',
    'Disallow: /en/auth/',
    '',
    'User-agent: Googlebot-Extended',
    'Allow: /',
    '',
    'User-agent: GPTBot',
    'Allow: /',
    '',
    'User-agent: PerplexityBot',
    'Allow: /',
    '',
    'User-agent: ClaudeBot',
    'Allow: /',
    '',
    'User-agent: anthropic-ai',
    'Allow: /',
    '',
    'User-agent: Applebot-Extended',
    'Allow: /',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ];

  return new NextResponse(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  });
}
