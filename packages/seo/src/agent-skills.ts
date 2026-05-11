/**
 * `agent-skills.json` builder (skill: geo-llm-optimization, CDC §6.5).
 *
 * Validated by Zod so editorial / Payload can override the catalog at runtime
 * while keeping the contract stable for downstream LLM agents.
 */
import { z } from 'zod';

export const AgentSkillInputSchemaZod = z.object({
  type: z.literal('object'),
  properties: z.record(
    z.object({
      type: z.enum(['string', 'integer', 'number', 'boolean']),
      description: z.string().optional(),
      format: z.string().optional(),
      minimum: z.number().optional(),
      maximum: z.number().optional(),
    }),
  ),
  required: z.array(z.string()).optional(),
});

export const AgentSkillZod = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  inputSchema: AgentSkillInputSchemaZod.optional(),
});

export const AgentSkillsDocumentZod = z.object({
  schemaVersion: z.literal('0.1'),
  site: z.string().min(1),
  skills: z.array(AgentSkillZod).min(1),
});

export type AgentSkill = z.infer<typeof AgentSkillZod>;
export type AgentSkillsDocument = z.infer<typeof AgentSkillsDocumentZod>;

export const DEFAULT_AGENT_SKILLS: AgentSkillsDocument = {
  schemaVersion: '0.1',
  site: 'ConciergeTravel.fr',
  skills: [
    {
      name: 'search',
      description:
        'Rechercher des hôtels 5★ et Palaces en France par destination et dates de séjour. Renvoie une liste paginée triée par pertinence.',
      inputSchema: {
        type: 'object',
        properties: {
          destination: {
            type: 'string',
            description: 'Ville, région ou slug normalisé (ex. "paris", "cote-d-azur").',
          },
          checkin: { type: 'string', format: 'date', description: 'Date d’arrivée YYYY-MM-DD.' },
          checkout: { type: 'string', format: 'date', description: 'Date de départ YYYY-MM-DD.' },
          adults: { type: 'integer', minimum: 1, maximum: 6 },
          children: { type: 'integer', minimum: 0, maximum: 4 },
        },
        required: ['destination'],
      },
    },
    {
      name: 'list-cities',
      description:
        'Lister toutes les destinations couvertes (villes & régions). Pas de paramètre — réponse cache 24h.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'get-hotel',
      description:
        'Récupérer la fiche détaillée d’un hôtel par son slug (description, équipements, restaurants, spa, localisation, conditions de séjour, distinctions, FAQ, rating Amadeus, JSON-LD Hotel). URL canonique : /fr/hotel/{slug} ou /en/hotel/{slug}.',
      inputSchema: {
        type: 'object',
        properties: {
          slug: {
            type: 'string',
            description: 'Slug kebab-case de la fiche (ex. "ritz-paris", "hotel-du-cap-eden-roc").',
          },
          locale: {
            type: 'string',
            description: 'Locale demandée — "fr" (par défaut) ou "en".',
          },
        },
        required: ['slug'],
      },
    },
    {
      name: 'get-hotel-room',
      description:
        'Récupérer une chambre ou suite spécifique d’un hôtel (description longue, équipements de la chambre, dimensions, capacité, photos, JSON-LD HotelRoom). URL canonique : /fr/hotel/{hotelSlug}/chambres/{roomSlug}.',
      inputSchema: {
        type: 'object',
        properties: {
          hotelSlug: {
            type: 'string',
            description:
              'Slug kebab-case de l’hôtel (ex. "peninsula-paris", "hotel-du-cap-eden-roc").',
          },
          roomSlug: {
            type: 'string',
            description:
              'Slug kebab-case de la chambre (ex. "chambre-deluxe", "suite-tour-eiffel").',
          },
          locale: {
            type: 'string',
            description: 'Locale demandée — "fr" (par défaut) ou "en".',
          },
        },
        required: ['hotelSlug', 'roomSlug'],
      },
    },
    {
      name: 'filter',
      description:
        'Filtrer le catalogue par type d’hébergement, équipements, classement étoiles, région.',
    },
    {
      name: 'compare-prices',
      description:
        'Obtenir un comparatif de tarifs non-affilié (Booking, Hotels.com, Expedia, etc.) pour un hôtel et des dates précises. Affichage texte sobre, sans logo ni lien, conforme aux règles légales du comparateur.',
      inputSchema: {
        type: 'object',
        properties: {
          hotelSlug: { type: 'string', description: 'Slug de l’hôtel à comparer.' },
          checkin: { type: 'string', format: 'date' },
          checkout: { type: 'string', format: 'date' },
          adults: { type: 'integer', minimum: 1, maximum: 6 },
        },
        required: ['hotelSlug', 'checkin', 'checkout'],
      },
    },
    {
      name: 'booking',
      description:
        'Lancer une réservation avec dates et voyageurs (paiement sécurisé Amadeus). Nécessite une session utilisateur.',
    },
    {
      name: 'request-quote',
      description:
        'Soumettre une demande de devis en mode email lorsque l’hôtel n’est pas connecté GDS (réponse humaine sous 24 h ouvrées).',
      inputSchema: {
        type: 'object',
        properties: {
          hotelSlug: { type: 'string', description: 'Slug de l’hôtel ciblé.' },
          checkin: { type: 'string', format: 'date' },
          checkout: { type: 'string', format: 'date' },
          adults: { type: 'integer', minimum: 1, maximum: 6 },
          message: {
            type: 'string',
            description: 'Demande libre du voyageur (préférences chambre, occasion, etc.).',
          },
          email: { type: 'string', format: 'email' },
        },
        required: ['hotelSlug', 'checkin', 'checkout', 'email'],
      },
    },
    {
      name: 'loyalty',
      description:
        'Consulter les avantages du programme de fidélité ConciergeTravel (tier FREE auto pour les hôtels Little Hotelier, tier PREMIUM payant).',
    },
  ],
};
