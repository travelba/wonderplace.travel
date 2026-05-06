# Architecture — ConciergeTravel.fr

## Vue d'ensemble

ConciergeTravel.fr est organisé en **quatre couches fonctionnelles** (cf. CDC §5) et **deux applications** Next.js partageant une base de packages.

```mermaid
flowchart TB
  subgraph apps
    web[apps/web<br/>Next.js 15<br/>front + booking + compte]
    admin[apps/admin<br/>Payload CMS 3<br/>back-office]
  end

  subgraph packages
    domain[packages/domain<br/>DDD pure TS]
    integrations[packages/integrations<br/>Amadeus · Little · Makcorps · Brevo · Algolia · Cloudinary · Sentry]
    db[packages/db<br/>Migrations SQL · RLS · Drizzle types]
    seo[packages/seo<br/>JSON-LD · llms.txt · sitemaps]
    ui[packages/ui<br/>Design system shadcn]
    emails[packages/emails<br/>React Email templates]
    obs[packages/observability<br/>Sentry · pino · web-vitals]
    config[packages/config<br/>env · ESLint · TS · Tailwind]
  end

  subgraph infra
    supabase[Supabase<br/>Postgres + Auth + RLS]
    redis[Upstash Redis<br/>cache + rate limit]
    algolia[Algolia<br/>search]
    amadeus[Amadeus GDS<br/>+ Payments]
    little[Little Hotelier]
    makcorps[Makcorps + Apify]
    brevo[Brevo]
    cloudinary[Cloudinary]
    vercel[Vercel]
  end

  web --> domain
  web --> integrations
  web --> seo
  web --> ui
  web --> obs
  web --> config

  admin --> domain
  admin --> integrations
  admin --> db
  admin --> emails
  admin --> obs
  admin --> config

  integrations --> amadeus
  integrations --> little
  integrations --> makcorps
  integrations --> brevo
  integrations --> algolia
  integrations --> cloudinary

  db --> supabase
  web --> supabase
  admin --> supabase

  web --> redis
  web --> vercel
  admin --> vercel
```

## Couches fonctionnelles

1. **Editorial (SEO/GEO)** — pages pilier, hubs régionaux et villes, fiches hôtels, classements, thématiques, comparatifs, guides, E-E-A-T. Rendu hybride SSG/ISR.
2. **Booking (transactionnel)** — recherche, résultats temps réel, fiche dynamique, tunnel 7 étapes, paiement Amadeus, confirmation, post-booking. SSR no-cache.
3. **Loyalty** — tier FREE auto, tier PREMIUM préparé. Surfaces : fiche, tunnel, espace client, e-mails.
4. **Administration** — Payload CMS 3 pour CRUD hôtels, contenu, FAQ, SEO, réservations, demandes e-mail, fidélité, reporting. Publication sans redéploiement via `revalidateTag`.

## Matrice de rendu (CDC §2.2)

| Type de page | Rendu | Revalidation |
| --- | --- | --- |
| Pilier `/hotels/france/` | SSG | ISR 24h |
| Hub régional / ville | SSG | ISR 12h |
| Fiche hôtel (sans dates) | SSG | ISR 6h |
| Page éditoriale (classement, thématique, guide) | SSG | ISR 24h |
| Résultats de recherche avec dates | SSR | No cache |
| Tunnel de réservation | SSR | No cache |
| API ARI / availabilities | SSR | Cache Redis 3 niveaux |

## Bounded contexts (DDD)

| Contexte | Responsabilités |
| --- | --- |
| `hotels` | Identité, localisation, état de publication, slugs, mode de réservation |
| `booking` | Aggregate Booking, machine à états, parsing politique d'annulation |
| `loyalty` | Règles de tiers, calcul des avantages, éligibilité |
| `pricing` | Normalisation Makcorps/Apify, calcul scénario comparateur |
| `editorial` | Pages éditoriales, slug/hreflang/canonical, validation AEO/FAQ |
| `shared` | `Result<T,E>`, branded types, erreurs |

## Couches de cache

| Niveau | TTL | Usage |
| --- | --- | --- |
| Long | 6h | Fiche hôtel sans dates (description, photos) |
| Court | 15min | Recherche avec dates (Amadeus offers) |
| No cache | — | Lookup pré-paiement (`hotel-offers/{offerId}`) |
| Comparator | 15min | Makcorps / Apify |
| Reviews | 24h | Google Places |

Détails dans le skill `redis-caching` et `docs/03-integrations/upstash-redis.md`.

## Intégrations principales

Voir `docs/03-integrations/` (un fichier par vendor).

## Sécurité

- RLS Supabase native sur toutes les tables business.
- Aucune donnée carte — paiement délégué à Amadeus Payments (PCI scope-out).
- Rate limiting Upstash sur les endpoints publics.
- Secrets exclusivement par variables d'environnement, validés via t3-env.
- Détails dans `docs/09-checklists/security.md` et le skill `security-engineering`.
