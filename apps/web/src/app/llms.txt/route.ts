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
            url: `${origin}/fr`,
            description:
              'Page d’accueil — agence IATA, sélection d’hôtels 5★ et Palaces en France.',
          },
          {
            url: `${origin}/fr/destination`,
            description:
              'Annuaire des destinations : Paris, Côte d’Azur, Bordelais, Alpes, Provence…',
          },
          {
            url: `${origin}/fr/recherche`,
            description:
              'Recherche temps réel par ville et dates (tarifs nets GDS, paiement Amadeus).',
          },
        ],
      },
      {
        title: 'Mentions légales & confiance',
        items: [
          {
            url: `${origin}/fr/mentions-legales`,
            description: 'Identité de l’éditeur, IATA, APST, RC professionnelle.',
          },
          {
            url: `${origin}/fr/cgv`,
            description: 'Conditions générales de vente, annulation, droit de rétractation.',
          },
          {
            url: `${origin}/fr/confidentialite`,
            description: 'Politique RGPD, finalités, base légale, droits des personnes.',
          },
          {
            url: `${origin}/fr/cookies`,
            description: 'Politique cookies — consentement opt-in pour analytics tiers.',
          },
        ],
      },
      {
        title: 'API LLM-actionnables',
        items: [
          {
            url: `${origin}/.well-known/agent-skills.json`,
            description:
              'Catalogue machine-readable des actions disponibles (search, get-hotel, request-quote…).',
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
