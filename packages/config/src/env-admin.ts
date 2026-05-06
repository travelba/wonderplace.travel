/**
 * Env loader specialized for `apps/admin` (Payload CMS).
 * Re-uses the shared schema and adds Payload-specific keys.
 */
import { z } from 'zod';
import { loadSharedEnv } from './env';

const AdminEnvSchema = z.object({
  PAYLOAD_SECRET: z.string().min(32),
  PAYLOAD_PUBLIC_SERVER_URL: z.string().url(),
});

export type AdminEnv = ReturnType<typeof loadSharedEnv> & z.infer<typeof AdminEnvSchema>;

export function loadAdminEnv(source: NodeJS.ProcessEnv = process.env): AdminEnv {
  const shared = loadSharedEnv(source);
  const parsed = AdminEnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid admin env:\n${issues}`);
  }
  return { ...shared, ...parsed.data };
}

export const env = loadAdminEnv();
