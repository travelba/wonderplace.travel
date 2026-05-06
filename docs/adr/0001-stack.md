# ADR 0001 — Stack technique

- Status: accepted
- Date: 2026-05-06
- Deciders: CTO, agent Cursor
- Refs: cahier des charges v3.0 §2

## Décision

La stack technique est verrouillée par le cahier des charges et reprise telle quelle :

- **Framework** : Next.js 15 App Router (React 19, Server Components par défaut)
- **Langage** : TypeScript strict (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
- **Base de données** : Supabase PostgreSQL avec RLS
- **Auth** : Supabase Auth via `@supabase/ssr`
- **Cache** : Upstash Redis (`@upstash/redis` HTTP)
- **Search** : Algolia (cf. ADR 0004)
- **CMS / back-office** : Payload CMS 3 (cf. ADR 0003)
- **Inventaire / réservation** : Amadeus Self-Service Hotels + Little Hotelier
- **Paiement** : Amadeus Payments (PCI géré, hors scope app)
- **Comparateur prix** : Makcorps (principal) + Apify (fallback)
- **E-mails** : Brevo (templates React Email + API transactional)
- **Monitoring** : Sentry + pino + Vercel Analytics ; Datadog optionnel Phase 2
- **Hébergement** : Vercel
- **Médias** : Cloudinary

## Contexte

Le cahier des charges v3.0 §2 et §3 imposent la stack ci-dessus et précisent qu'aucune substitution ne peut être faite sans validation explicite du CTO et avenant.

## Alternatives considérées

Aucune — la stack est contractuelle. Les alternatives techniques restent envisageables uniquement par voie d'avenant (ex. self-hosted Meilisearch vs Algolia, voir ADR 0004).

## Conséquences

- Performance maximale pour SEO via SSG/ISR (Next.js 15).
- Pas de scope PCI DSS côté app grâce à Amadeus Payments.
- Coût opérationnel maîtrisé : services managés (Vercel, Supabase, Upstash, Algolia, Brevo).
- Nécessite une couche d'intégration disciplinée pour Amadeus + Little Hotelier (cf. skill `api-integration`).
