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
});
