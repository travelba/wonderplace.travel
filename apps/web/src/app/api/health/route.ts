import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Health endpoint — used by Vercel monitors and external uptime checks.
 * Phase 3 will add parallel pings to Supabase / Redis / Algolia / Amadeus.
 */
export function GET() {
  return NextResponse.json(
    {
      ok: true,
      service: 'cct-web',
      time: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
