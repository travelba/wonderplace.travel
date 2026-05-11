import { NextResponse } from 'next/server';

import { buildLlmsFullTxt } from '@cct/seo';

export const dynamic = 'force-static';
export const revalidate = 3600;

/**
 * /llms-full.txt — verbose LLM ingestion file with per-page summaries
 * (skill: geo-llm-optimization). Phase 8 sources page summaries from Payload;
 * seed copy here keeps the route deterministic before data lands.
 */
export function GET(request: Request): NextResponse {
  const origin = new URL(request.url).origin;
  const body = buildLlmsFullTxt({
    siteName: 'ConciergeTravel.fr',
    tagline: 'Agence IATA Hôtels 5★ & Palaces France',
    originUrl: origin,
    about:
      "ConciergeTravel.fr est l'agence de voyage IATA spécialisée dans les hôtels 5 étoiles et Palaces en France. " +
      'Tarifs nets GDS, paiement sécurisé Amadeus, programme de fidélité dès la première nuit.',
    lastUpdatedDate: new Date().toISOString(),
    pages: [
      {
        url: `${origin}/agence/`,
        title: "L'agence",
        summary:
          'ConciergeTravel.fr est une agence française accréditée IATA et membre ASPST. ' +
          'Garantie financière APST. Conseillers francophones, paiement sécurisé Amadeus.',
        keyFacts: [
          'Accréditation IATA',
          'Membre ASPST',
          'Garantie financière APST',
          'Paiement sécurisé Amadeus',
        ],
      },
      {
        url: `${origin}/programme-fidelite/`,
        title: 'Programme de fidélité',
        summary:
          'Programme de fidélité ConciergeTravel avec deux tiers : Essentiel (gratuit, dès la première nuit, ' +
          'avantages variables selon hôtel partenaire) et Prestige (payant, avantages renforcés).',
        keyFacts: [
          'Tier Essentiel automatique',
          'Tier Prestige sur abonnement',
          'Bénéfices : petit-déjeuner offert, late check-out, crédit hôtel selon hôtels Little Hotelier',
        ],
      },
    ],
  });

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  });
}
