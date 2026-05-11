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
      description: 'Consulter les avantages du programme de fidélité ConciergeTravel.',
    },
  ],
};
