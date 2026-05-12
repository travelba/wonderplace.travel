# Environment variables — ConciergeTravel.fr

Toute variable d'environnement utilisée par le projet est listée ici. Le fichier `.env.example` est la source synchronisée pour le scaffolding local. La validation runtime est assurée par `@cct/config/env` (t3-env + Zod) qui fait échouer le boot si une variable obligatoire est manquante ou invalide.

> Convention : préfixe `NEXT_PUBLIC_` = exposé au client. Tout le reste est server-only.

## Public site

| Variable                     | Type         | Scope           | Description                                                         |
| ---------------------------- | ------------ | --------------- | ------------------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`       | URL          | client + server | URL canonique (sans slash final). Ex. `https://conciergetravel.fr`. |
| `NEXT_PUBLIC_SITE_NAME`      | string       | client + server | "ConciergeTravel".                                                  |
| `NEXT_PUBLIC_DEFAULT_LOCALE` | `fr` \| `en` | client + server | Locale par défaut. `fr` en MVP.                                     |

## Supabase

| Variable                        | Type         | Scope           | Description                                                                                   |
| ------------------------------- | ------------ | --------------- | --------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | URL          | client + server | URL projet.                                                                                   |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | string       | client + server | Clé anon pour client SSR.                                                                     |
| `SUPABASE_SERVICE_ROLE_KEY`     | string       | server only     | Clé service role pour migrations + Payload + admin server. **Ne jamais exposer côté client.** |
| `SUPABASE_DB_URL`               | postgres URL | server only     | DSN PostgreSQL utilisé par Payload + scripts de migration.                                    |
| `SUPABASE_PROJECT_REF`          | string       | server only     | Référence projet (ex. `abcdefgh`) pour la CLI Supabase.                                       |

## Upstash Redis

| Variable                   | Type   | Scope  | Description    |
| -------------------------- | ------ | ------ | -------------- |
| `UPSTASH_REDIS_REST_URL`   | URL    | server | Endpoint REST. |
| `UPSTASH_REDIS_REST_TOKEN` | string | server | Token REST.    |

## Algolia

| Variable                         | Type   | Scope           | Description                    |
| -------------------------------- | ------ | --------------- | ------------------------------ |
| `NEXT_PUBLIC_ALGOLIA_APP_ID`     | string | client + server | App ID.                        |
| `NEXT_PUBLIC_ALGOLIA_SEARCH_KEY` | string | client + server | Clé search-only (sécurisable). |
| `ALGOLIA_ADMIN_API_KEY`          | string | server          | Clé admin pour indexation.     |
| `ALGOLIA_INDEX_PREFIX`           | string | server          | `dev_`, `staging_`, `prod_`.   |

## Amadeus

| Variable                         | Type                   | Scope  | Description                               |
| -------------------------------- | ---------------------- | ------ | ----------------------------------------- |
| `AMADEUS_ENV`                    | `test` \| `production` | server | Environnement Amadeus.                    |
| `AMADEUS_API_KEY`                | string                 | server | Client ID OAuth2.                         |
| `AMADEUS_API_SECRET`             | string                 | server | Client secret OAuth2.                     |
| `AMADEUS_PAYMENT_WEBHOOK_SECRET` | string                 | server | HMAC pour `/api/webhook/amadeus-payment`. |

## Little Hotelier

| Variable                   | Type   | Scope  | Description   |
| -------------------------- | ------ | ------ | ------------- |
| `LITTLE_HOTELIER_API_BASE` | URL    | server | Base URL API. |
| `LITTLE_HOTELIER_API_KEY`  | string | server | Clé API.      |

## Makcorps + Apify

| Variable               | Type   | Scope  | Description                                 |
| ---------------------- | ------ | ------ | ------------------------------------------- |
| `MAKCORPS_API_BASE`    | URL    | server | Base URL Makcorps.                          |
| `MAKCORPS_API_KEY`     | string | server | Clé API Makcorps.                           |
| `MAKCORPS_DAILY_QUOTA` | number | server | Plafond quotidien d'appels (sécurité coût). |
| `APIFY_API_TOKEN`      | string | server | Token Apify (fallback).                     |
| `APIFY_HOTEL_ACTOR_ID` | string | server | ID de l'actor Apify utilisé.                |

## Google Places

| Variable                | Type   | Scope  | Description                     |
| ----------------------- | ------ | ------ | ------------------------------- |
| `GOOGLE_PLACES_API_KEY` | string | server | Clé Places API (Place Details). |

## Brevo

| Variable                   | Type   | Scope  | Description                                |
| -------------------------- | ------ | ------ | ------------------------------------------ |
| `BREVO_API_KEY`            | string | server | Clé API transactional.                     |
| `BREVO_SENDER_EMAIL`       | email  | server | Adresse expéditeur.                        |
| `BREVO_SENDER_NAME`        | string | server | Nom expéditeur.                            |
| `BREVO_INTERNAL_OPS_EMAIL` | email  | server | Adresse interne pour demandes hors-réseau. |

## Sentry

| Variable                 | Type   | Scope           | Description                                      |
| ------------------------ | ------ | --------------- | ------------------------------------------------ |
| `NEXT_PUBLIC_SENTRY_DSN` | URL    | client + server | DSN.                                             |
| `SENTRY_AUTH_TOKEN`      | string | CI only         | Upload des source maps.                          |
| `SENTRY_ORG`             | string | CI only         | Slug org.                                        |
| `SENTRY_PROJECT_WEB`     | string | CI only         | `cct-web`.                                       |
| `SENTRY_PROJECT_ADMIN`   | string | CI only         | `cct-admin`.                                     |
| `SENTRY_ENV`             | string | server          | `dev` \| `preview` \| `staging` \| `production`. |
| `SENTRY_RELEASE`         | string | build time      | git SHA.                                         |

## Cloudinary

| Variable                | Type   | Scope           | Description   |
| ----------------------- | ------ | --------------- | ------------- |
| `CLOUDINARY_CLOUD_NAME` | string | client + server | Cloud name.   |
| `CLOUDINARY_API_KEY`    | string | client + server | Clé publique. |
| `CLOUDINARY_API_SECRET` | string | server          | Secret.       |

## Payload CMS

| Variable                    | Type   | Scope  | Description                              |
| --------------------------- | ------ | ------ | ---------------------------------------- |
| `PAYLOAD_SECRET`            | string | server | Secret de signature des cookies Payload. |
| `PAYLOAD_PUBLIC_SERVER_URL` | URL    | server | URL publique du back-office.             |

## Cron / interne

| Variable            | Type   | Scope  | Description                                     |
| ------------------- | ------ | ------ | ----------------------------------------------- |
| `CRON_SECRET`       | string | server | Protège les routes `/api/cron/*` (Vercel Cron). |
| `REVALIDATE_SECRET` | string | server | HMAC pour la revalidation depuis Payload.       |

## Feature flags

| Variable                          | Type    | Scope  | Description                                                    |
| --------------------------------- | ------- | ------ | -------------------------------------------------------------- |
| `DATADOG_ENABLED`                 | boolean | server | Active l'instrumentation Datadog (Phase 2).                    |
| `LOYALTY_PREMIUM_BILLING_ENABLED` | boolean | server | Active la souscription tier PREMIUM (Phase 2 — voir ADR 0005). |
