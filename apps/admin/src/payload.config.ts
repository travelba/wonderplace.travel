import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildConfig } from 'payload';
import { postgresAdapter } from '@payloadcms/db-postgres';
import { lexicalEditor } from '@payloadcms/richtext-lexical';
import { Users } from './collections/users';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Payload CMS 3 configuration — minimal Phase 1 skeleton.
 * Phase 8 will add: Hotels, HotelRooms, EditorialPages, FaqEntries, Authors,
 * Media, BookingRequestsEmail, Bookings (read-mostly), LoyaltyMembers,
 * Redirects, plus globals (SiteSettings, RobotsConfig, LlmsTxtSource) and
 * afterChange hooks (Algolia reindex + revalidateTag).
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
  collections: [Users],
  db: postgresAdapter({
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
