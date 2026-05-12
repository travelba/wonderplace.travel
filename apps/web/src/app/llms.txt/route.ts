import { NextResponse } from 'next/server';

import { buildLlmsTxt, type LlmsTxtSectionItem } from '@cct/seo';

import { listPublishedHotelSummaries } from '@/server/hotels/get-hotel-by-slug';

// ISR — re-fetches the catalog hourly. The CDN keeps a stale copy for up
// to a day so this route never serves a slow miss.
export const revalidate = 3600;

/**
 * /llms.txt — concise index for LLMs (skill: geo-llm-optimization).
 *
 * Phase 10.5 wires a dynamic "Catalogue" section sourced from the published
 * `hotels` table (top-50 by priority then name). The corpus stays small —
 * one line per hotel, no description — which is the format llms.txt
 * consumers (ChatGPT Search, Perplexity, Claude) actually parse.
 *
 * Phase 8 will pull editorial copy & long descriptions from Payload; for now
 * we ship deterministic seed copy + dynamic catalog.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const origin = new URL(request.url).origin;
  const hotels = await listPublishedHotelSummaries(50);

  const catalogItems: LlmsTxtSectionItem[] = hotels.map((h) => {
    const distinction = h.isPalace ? 'Palace' : `${h.stars} étoiles`;
    return {
      url: `${origin}/fr/hotel/${h.slugFr}`,
      description: `${h.nameFr} (${h.city}) — ${distinction}. Fiche complète : photos, chambres, restaurants, FAQ, distinctions.`,
    };
  });

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
      ...(catalogItems.length > 0
        ? [
            {
              title: `Catalogue (top ${catalogItems.length} fiches éditoriales)`,
              items: catalogItems,
            },
          ]
        : []),
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
              'Catalogue machine-readable des actions disponibles (search, get-hotel, get-hotel-room, request-quote…).',
          },
          {
            url: `${origin}/sitemap.xml`,
            description:
              'Index des sitemaps (hotels, rooms, hubs, éditorial, guides) — chaque sub-sitemap inclut les alternates FR/EN.',
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
