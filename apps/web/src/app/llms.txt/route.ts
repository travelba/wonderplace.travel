import { NextResponse } from 'next/server';

import { buildLlmsTxt } from '@cct/seo';

export const dynamic = 'force-static';
export const revalidate = 3600;

/**
 * /llms.txt — concise index for LLMs (skill: geo-llm-optimization).
 * Phase 8 will source the strategic-pages list + about copy from Payload
 * `LlmsTxtSource` global; for now we ship a deterministic seed list.
 */
export function GET(request: Request): NextResponse {
  const origin = new URL(request.url).origin;
  const body = buildLlmsTxt({
    siteName: 'ConciergeTravel.fr',
    tagline: 'Agence IATA Hôtels 5★ & Palaces France',
    originUrl: origin,
    about:
      "ConciergeTravel.fr est l'agence de voyage IATA spécialisée dans les hôtels 5 étoiles et Palaces en France. " +
      'Tarifs nets GDS, paiement sécurisé Amadeus, programme de fidélité dès la première nuit.',
    lastUpdatedDate: new Date().toISOString(),
    sections: [
      {
        title: 'Pages stratégiques',
        items: [
          {
            url: `${origin}/hotels/france/`,
            description: 'Pilier France : tous les hôtels 5★ et Palaces référencés.',
          },
          {
            url: `${origin}/selection/`,
            description:
              'Sélections éditoriales par expérience (romantique, famille, gastronomie, vignobles).',
          },
          {
            url: `${origin}/guides/`,
            description:
              'Guides pratiques (réserver un palace, comprendre le classement, hors saison).',
          },
          {
            url: `${origin}/programme-fidelite/`,
            description: 'Programme de fidélité ConciergeTravel Essentiel et Prestige.',
          },
          {
            url: `${origin}/agence/`,
            description: "L'agence IATA, ASPST, garantie financière APST.",
          },
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
