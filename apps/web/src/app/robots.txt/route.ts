import { NextResponse } from 'next/server';

import { env } from '@/lib/env';

export const dynamic = 'force-static';
export const revalidate = 86400;

const FALLBACK_SITE_URL = 'https://conciergetravel.fr';

/**
 * robots.txt — generated dynamically so the SEO team can override allow/disallow
 * via Payload `RobotsConfig` global. Skill: seo-technical, geo-llm-optimization.
 *
 * `force-static` here means the route is prerendered. Reading `request.url`
 * at build time bakes the build-host (typically `http://localhost:3000`)
 * into the deployed Sitemap reference. We read the canonical site URL
 * from validated env to keep production output correct.
 */
export function GET() {
  const origin = (env.NEXT_PUBLIC_SITE_URL ?? FALLBACK_SITE_URL).replace(/\/$/, '');

  // LLM crawler tokens use the official robots.txt user-agent strings as of 2026:
  //   - `Google-Extended`     — Google's AI training opt-out (no hyphen "bot")
  //   - `GPTBot`              — OpenAI training crawler
  //   - `OAI-SearchBot`       — OpenAI's ChatGPT Search index
  //   - `ChatGPT-User`        — when ChatGPT browses live for a user query
  //   - `PerplexityBot`       — Perplexity search index
  //   - `Perplexity-User`     — Perplexity live browse
  //   - `ClaudeBot`           — Anthropic crawler
  //   - `anthropic-ai`        — legacy Anthropic crawler (kept for back-compat)
  //   - `Applebot-Extended`   — Apple AI training opt-out
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
    'Disallow: /monitoring',
    '',
    'User-agent: Google-Extended',
    'Allow: /',
    '',
    'User-agent: GPTBot',
    'Allow: /',
    '',
    'User-agent: OAI-SearchBot',
    'Allow: /',
    '',
    'User-agent: ChatGPT-User',
    'Allow: /',
    '',
    'User-agent: PerplexityBot',
    'Allow: /',
    '',
    'User-agent: Perplexity-User',
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
