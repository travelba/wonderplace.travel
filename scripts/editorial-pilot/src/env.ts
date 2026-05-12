import { config as loadDotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

loadDotenv({ path: resolve(__dirname, '../../../.env.local') });
loadDotenv({ path: resolve(__dirname, '../../../.env') });

const ProviderSchema = z.enum(['openai', 'anthropic']);
export type Provider = z.infer<typeof ProviderSchema>;

const optionalApiKey = z.preprocess(
  (v) => (typeof v === 'string' && v.trim().length === 0 ? undefined : v),
  z.string().min(20).optional(),
);

const optionalProvider = z.preprocess(
  (v) => (typeof v === 'string' && v.trim().length === 0 ? undefined : v),
  ProviderSchema.optional(),
);

const EnvSchema = z
  .object({
    OPENAI_API_KEY: optionalApiKey,
    ANTHROPIC_API_KEY: optionalApiKey,
    EDITORIAL_PILOT_PROVIDER: optionalProvider,
    EDITORIAL_PILOT_OPENAI_MODEL: z.string().min(3).default('gpt-4o-2024-11-20'),
    EDITORIAL_PILOT_ANTHROPIC_MODEL: z.string().min(3).default('claude-sonnet-4-5-20250929'),
  })
  .refine((v) => Boolean(v.OPENAI_API_KEY) || Boolean(v.ANTHROPIC_API_KEY), {
    message:
      'At least one of OPENAI_API_KEY / ANTHROPIC_API_KEY must be defined in .env.local at the monorepo root.',
  });

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `- ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`[editorial-pilot] Invalid environment:\n${issues}`);
  }
  return parsed.data;
}

export function resolveProvider(env: Env): Provider {
  if (env.EDITORIAL_PILOT_PROVIDER) {
    if (env.EDITORIAL_PILOT_PROVIDER === 'openai' && !env.OPENAI_API_KEY) {
      throw new Error('EDITORIAL_PILOT_PROVIDER=openai but OPENAI_API_KEY is missing.');
    }
    if (env.EDITORIAL_PILOT_PROVIDER === 'anthropic' && !env.ANTHROPIC_API_KEY) {
      throw new Error('EDITORIAL_PILOT_PROVIDER=anthropic but ANTHROPIC_API_KEY is missing.');
    }
    return env.EDITORIAL_PILOT_PROVIDER;
  }
  if (env.OPENAI_API_KEY) return 'openai';
  return 'anthropic';
}
