# Intégration — Upstash Redis (cache + rate limit)

- Owner package : `packages/integrations/redis`
- Skill : `redis-caching`
- CDC : v3.0 §7.2 + addendum v3.2 §B.2

> Document rempli en Phase 3. Niveaux de cache (long 6h, court 15 min, no cache pré-paiement), idempotence (booking, e-mail), rate limiting (search 50 r/min/IP, comparator 30 r/min/IP, login 5/15min), namespacing des clés.
