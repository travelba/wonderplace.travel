import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { postgresAdapter } from '@payloadcms/db-postgres';
import { lexicalEditor } from '@payloadcms/richtext-lexical';
import { buildConfig } from 'payload';

import { Hotels } from './collections/hotels';
import { Users } from './collections/users';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Payload CMS 3 configuration.
 *
 * Phase 1 skeleton + Phase 8 chantier D: Hotels editorial mirror.
 *
 * `schemaName: 'cms'` isolates every Payload-managed table inside the
 * `cms` schema (created by migration 0009). It guarantees Payload never
 * collides with the SQL-migrated canonical tables in `public.*` (hotels,
 * profiles, bookings, …). See ADR 0003 (Payload chosen) + ADR 0010
 * (dual-table mirror strategy for hotels).
 *
 * Remaining Phase 8 collections (HotelRooms, EditorialPages, FaqEntries,
 * Authors, Media, BookingRequestsEmail, Bookings read-mostly,
 * LoyaltyMembers, Redirects) + globals (SiteSettings, RobotsConfig,
 * LlmsTxtSource) + sync hooks `cms.hotels → public.hotels` (Phase 8.1)
 * still to come.
 */
export default buildConfig({
  serverURL: process.env['PAYLOAD_PUBLIC_SERVER_URL'] ?? 'http://localhost:3001',
  admin: {
    user: Users.slug,
    meta: {
      titleSuffix: '— ConciergeTravel admin',
    },
  },
  editor: lexicalEditor({}),
  collections: [Users, Hotels],
  db: postgresAdapter({
    schemaName: 'cms',
    disableCreateDatabase: true,
    pool: {
      connectionString: process.env['SUPABASE_DB_URL'] ?? '',
    },
  }),
  secret: process.env['PAYLOAD_SECRET'] ?? '',
  typescript: {
    outputFile: path.resolve(__dirname, '../payload-types.ts'),
  },
  cors: [process.env['NEXT_PUBLIC_SITE_URL'] ?? 'http://localhost:3000'],
  csrf: [process.env['NEXT_PUBLIC_SITE_URL'] ?? 'http://localhost:3000'],
});
