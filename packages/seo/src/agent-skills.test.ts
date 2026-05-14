import { describe, expect, it } from 'vitest';

import { AgentSkillsDocumentZod, DEFAULT_AGENT_SKILLS } from './agent-skills';

describe('agent-skills', () => {
  it('default document satisfies its own Zod schema', () => {
    const parsed = AgentSkillsDocumentZod.safeParse(DEFAULT_AGENT_SKILLS);
    expect(parsed.success).toBe(true);
  });

  it('rejects documents missing schemaVersion', () => {
    const parsed = AgentSkillsDocumentZod.safeParse({
      site: 'X',
      skills: [{ name: 's', description: 'd' }],
    });
    expect(parsed.success).toBe(false);
  });

  it('exposes the post-Phase-2 catalog of LLM-actionable skills', () => {
    const skillNames = DEFAULT_AGENT_SKILLS.skills.map((skill) => skill.name);
    expect(skillNames).toEqual(
      expect.arrayContaining([
        'search',
        'list-cities',
        'get-hotel',
        'get-hotel-room',
        'filter',
        'list-rankings',
        'get-ranking',
        'compare-prices',
        'booking',
        'request-quote',
        'loyalty',
      ]),
    );
  });

  it('every skill that declares an inputSchema lists its required keys among its properties', () => {
    for (const skill of DEFAULT_AGENT_SKILLS.skills) {
      if (!skill.inputSchema) continue;
      const properties = Object.keys(skill.inputSchema.properties);
      for (const requiredKey of skill.inputSchema.required ?? []) {
        expect(properties).toContain(requiredKey);
      }
    }
  });
});
