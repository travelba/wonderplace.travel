/**
 * Rollback for the Peninsula Paris test seed.
 *
 * Deletes the `hotels` row matching `slug = 'peninsula-paris'`. The FK
 * cascade on `hotel_rooms.hotel_id` removes the associated room rows
 * automatically. Cloudinary assets are NOT deleted by this script (use
 * `cloudinary-asset-mgmt` tooling with the tag `cct:test:peninsula` if you
 * need to wipe them).
 *
 * Idempotent: if no row matches the slug, exits with code 0.
 *
 * Refuses to run on prod unless `SEED_ALLOW_PROD=true`.
 *
 * Usage (from repo root):
 *   pnpm --filter @cct/db teardown:peninsula
 */
import postgres from 'postgres';
import { z } from 'zod';

const Env = z.object({
  SUPABASE_DB_URL: z
    .string()
    .min(1)
    .refine(
      (s) => s.startsWith('postgresql://') || s.startsWith('postgres://'),
      'SUPABASE_DB_URL must be a Postgres connection URI',
    ),
  NODE_ENV: z.string().optional(),
  SEED_ALLOW_PROD: z.string().optional(),
});

const HOTEL_SLUG = 'peninsula-paris';

function refuseInProd(env: {
  readonly NODE_ENV?: string | undefined;
  readonly SEED_ALLOW_PROD?: string | undefined;
}): boolean {
  if (env.NODE_ENV === 'production' && env.SEED_ALLOW_PROD !== 'true') {
    console.error(
      '[teardown:peninsula] refusing to run in production. Set SEED_ALLOW_PROD=true to override.',
    );
    return true;
  }
  return false;
}

async function main(): Promise<void> {
  const parsedEnv = Env.safeParse(process.env);
  if (!parsedEnv.success) {
    console.error('[teardown:peninsula] invalid env:', parsedEnv.error.flatten());
    process.exitCode = 1;
    return;
  }
  if (refuseInProd(parsedEnv.data)) {
    process.exitCode = 1;
    return;
  }

  const sql = postgres(parsedEnv.data.SUPABASE_DB_URL, {
    max: 1,
    onnotice: () => undefined,
  });

  try {
    const rows = await sql<Array<{ id: string }>>`
      delete from public.hotels where slug = ${HOTEL_SLUG} returning id
    `;
    if (rows.length === 0) {
      console.info(`[teardown:peninsula] no row matched slug=${HOTEL_SLUG}. Nothing to do.`);
    } else {
      const [first] = rows;
      console.info(
        `[teardown:peninsula] deleted hotel ${HOTEL_SLUG} (id=${first?.id ?? '?'}). hotel_rooms removed by FK cascade.`,
      );
    }
    console.info('[teardown:peninsula] Cloudinary assets NOT deleted — use the tag');
    console.info('[teardown:peninsula]   tags="cct:test:peninsula"  (cloud dvbjwh5wy)');
  } catch (error) {
    console.error('[teardown:peninsula] failed:', error);
    process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

void main().catch((error) => {
  console.error('[teardown:peninsula] unhandled:', error);
  process.exit(1);
});
