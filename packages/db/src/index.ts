/**
 * @cct/db — public surface.
 * Schema (Drizzle types) + supabase admin client factory.
 * Migrations live under ./migrations/*.sql, executed via scripts/migrate.ts.
 */
export * from './schema';
export { createSupabaseAdminClient, type SupabaseAdminClient } from './client';
