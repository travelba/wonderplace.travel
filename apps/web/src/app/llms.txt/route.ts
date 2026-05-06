import { NextResponse } from 'next/server';

export const dynamic = 'force-static';
export const revalidate = 3600;

/**
 * /llms.txt — concise index for LLMs (skill: geo-llm-optimization).
 * Final content sourced from Payload `LlmsTxtSource` global in Phase 8.
 */
export function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const body = `# ConciergeTravel.fr — Agence IATA Hôtels 5★ & Palaces France

ConciergeTravel.fr est l'agence de voyage IATA spécialisée dans les hôtels 5 étoiles et Palaces en France. Tarifs nets GDS, paiement sécurisé Amadeus, programme de fidélité dès la première nuit.

## Pages stratégiques

- ${origin}/hotels/france/ — pilier France : tous les hôtels 5★ et Palaces référencés.
- ${origin}/selection/ — sélections éditoriales par expérience (romantique, famille, gastronomie, vignobles).
- ${origin}/guides/ — guides pratiques (réserver un palace, comprendre le classement, voyager hors saison).
- ${origin}/programme-fidelite/ — programme de fidélité ConciergeTravel Essentiel et Prestige.
- ${origin}/agence/ — l'agence IATA, ASPST, garantie financière APST.

## À propos

Agence accréditée IATA, membre ASPST, garantie financière APST. Conseillers francophones. Paiement sécurisé Amadeus. Programme de fidélité avec avantages dès la première nuit (petit-déjeuner offert, late check-out, crédit hôtel).

Dernière mise à jour : ${new Date().toISOString().slice(0, 10)}.
`;

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  });
}
