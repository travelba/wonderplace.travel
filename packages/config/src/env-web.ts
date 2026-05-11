/**
 * Env loader specialized for `apps/web`. Uses `@t3-oss/env-nextjs` so that
 * client / server boundaries are statically enforced and unset client vars
 * fail the build.
 */
import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
  server: {
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    SUPABASE_DB_URL: z.string().min(1),
    UPSTASH_REDIS_REST_URL: z.string().url(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1),
    ALGOLIA_ADMIN_API_KEY: z.string().min(1),
    ALGOLIA_INDEX_PREFIX: z.string().default('dev_'),
    AMADEUS_ENV: z.enum(['test', 'production']),
    AMADEUS_API_KEY: z.string().min(1),
    AMADEUS_API_SECRET: z.string().min(1),
    AMADEUS_PAYMENT_WEBHOOK_SECRET: z.string().min(1),
    LITTLE_HOTELIER_API_BASE: z.string().url(),
    LITTLE_HOTELIER_API_KEY: z.string().min(1),
    MAKCORPS_API_BASE: z.string().url(),
    MAKCORPS_API_KEY: z.string().min(1),
    MAKCORPS_DAILY_QUOTA: z.coerce.number().int().positive().default(10000),
    APIFY_API_TOKEN: z.string().optional(),
    APIFY_HOTEL_ACTOR_ID: z.string().optional(),
    GOOGLE_PLACES_API_KEY: z.string().min(1),
    BREVO_API_KEY: z.string().min(1),
    BREVO_SENDER_EMAIL: z.string().email(),
    BREVO_SENDER_NAME: z.string().min(1),
    BREVO_INTERNAL_OPS_EMAIL: z.string().email(),
    SENTRY_ENV: z.enum(['dev', 'preview', 'staging', 'production']).default('dev'),
    SENTRY_RELEASE: z.string().optional(),
    SENTRY_AUTH_TOKEN: z.string().optional(),
    CLOUDINARY_API_SECRET: z.string().min(1),
    CRON_SECRET: z.string().min(16),
    REVALIDATE_SECRET: z.string().min(16),
    DATADOG_ENABLED: z.coerce.boolean().default(false),
    LOYALTY_PREMIUM_BILLING_ENABLED: z.coerce.boolean().default(false),
  },
  client: {
    NEXT_PUBLIC_SITE_URL: z.string().url(),
    NEXT_PUBLIC_SITE_NAME: z.string().default('ConciergeTravel'),
    NEXT_PUBLIC_DEFAULT_LOCALE: z.enum(['fr', 'en']).default('fr'),
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
    NEXT_PUBLIC_ALGOLIA_APP_ID: z.string().min(1),
    NEXT_PUBLIC_ALGOLIA_SEARCH_KEY: z.string().min(1),
    NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
    /**
     * Cloudinary cloud (e.g. "dvbjwh5wy") used to build delivery URLs.
     * Appears verbatim in every `https://res.cloudinary.com/<cloud>/…`
     * URL — not a secret. Required client-side for `<HotelImage>` /
     * `<HotelGallery>`.
     */
    NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: z.string().min(1),
  },
  experimental__runtimeEnv: {
    NEXT_PUBLIC_SITE_URL: process.env['NEXT_PUBLIC_SITE_URL'],
    NEXT_PUBLIC_SITE_NAME: process.env['NEXT_PUBLIC_SITE_NAME'],
    NEXT_PUBLIC_DEFAULT_LOCALE: process.env['NEXT_PUBLIC_DEFAULT_LOCALE'],
    NEXT_PUBLIC_SUPABASE_URL: process.env['NEXT_PUBLIC_SUPABASE_URL'],
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'],
    NEXT_PUBLIC_ALGOLIA_APP_ID: process.env['NEXT_PUBLIC_ALGOLIA_APP_ID'],
    NEXT_PUBLIC_ALGOLIA_SEARCH_KEY: process.env['NEXT_PUBLIC_ALGOLIA_SEARCH_KEY'],
    NEXT_PUBLIC_SENTRY_DSN: process.env['NEXT_PUBLIC_SENTRY_DSN'],
    NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: process.env['NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME'],
  },
  skipValidation: process.env['SKIP_ENV_VALIDATION'] === 'true',
  emptyStringAsUndefined: true,
});
