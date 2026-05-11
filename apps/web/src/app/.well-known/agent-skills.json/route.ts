import { NextResponse } from 'next/server';

import { DEFAULT_AGENT_SKILLS } from '@cct/seo';

export const dynamic = 'force-static';
export const revalidate = 86400;

/**
 * /.well-known/agent-skills.json — declarative skills exposed to LLM agents.
 * Catalog sourced from `@cct/seo` (skill: geo-llm-optimization, CDC §6.5).
 */
export function GET(): NextResponse {
  return NextResponse.json(DEFAULT_AGENT_SKILLS, {
    headers: {
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
