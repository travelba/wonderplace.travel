import { NextResponse } from 'next/server';

export const dynamic = 'force-static';
export const revalidate = 86400;

/**
 * /.well-known/agent-skills.json — declarative skills exposed to LLM agents.
 * Reference: skill `geo-llm-optimization`, CDC §6.5, Excel "GEO & Agentique".
 */
export function GET() {
  const body = {
    schemaVersion: '0.1',
    site: 'ConciergeTravel.fr',
    skills: [
      {
        name: 'search',
        description: 'Rechercher des hôtels par destination et dates de séjour.',
        inputSchema: {
          type: 'object',
          properties: {
            destination: { type: 'string', description: 'Ville ou région en France' },
            checkin: { type: 'string', format: 'date' },
            checkout: { type: 'string', format: 'date' },
            adults: { type: 'integer', minimum: 1, maximum: 6 },
          },
          required: ['destination'],
        },
      },
      {
        name: 'filter',
        description: 'Filtrer le catalogue par type, équipements, étoiles, région.',
      },
      {
        name: 'booking',
        description: 'Lancer une réservation avec dates et voyageurs (paiement sécurisé Amadeus).',
      },
      {
        name: 'loyalty',
        description: "Consulter les avantages du programme de fidélité ConciergeTravel.",
      },
    ],
  } as const;

  return NextResponse.json(body, {
    headers: {
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
