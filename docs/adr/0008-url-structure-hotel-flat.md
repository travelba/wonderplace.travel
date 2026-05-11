# ADR 0008 — Structure URL fiche hôtel : slug plat `/hotel/[slug]`

- Status: accepted
- Date: 2026-05-11
- Refs: skill `seo-technical`, rule `hotel-detail-page`, CDC v3.0 §3.3, ADR-0007

## Décision

L'URL canonique d'une fiche hôtel reste `/hotel/[slug]` (singulier, segment unique).
Nous **divergeons délibérément** du CDC v3.0 §3.3 qui demande `/hotels/[pays]/[ville]/[slug-hotel]`.

Conventions associées :

- `slug` court, kebab-case, max 60 chars, mots-clés en tête (`hotel-ritz-paris`, `cap-eden-roc-antibes`).
- Hub géo : `/destination/[city-slug]` continue à jouer le rôle de page-pays/ville.
- Sous-pages chambres : `/hotel/[slug]/chambres/[room-slug]` (voir [ADR-0009](0009-hotel-room-subpages-indexable.md)).
- Sous-pages thématiques (`spa`, `restaurant`, `evenements`) ouvertes uniquement si la rédaction commet ≥ 300 mots uniques + FAQ dédiée.

## Contexte

Le CDC v3.0 §3.3 demande explicitement `/hotels/[pays]/[ville]/[slug-hotel]` au motif que la profondeur d'URL aiderait l'utilisateur à se repérer et "renforcerait le maillage géographique".

Au moment de la rédaction, l'application a déjà :

- ADR-0007 en production (`/hotel/[slug]` en ISR `revalidate = 3600`).
- Tout le maillage interne (`SiteHeader`, `Footer`, `RelatedHotels`, `<HotelCard>`, `ItemList` JSON-LD du `/destination/[city]`) qui pointe vers `/hotel/[slug]`.
- Sitemap segmenté `sitemap-hotels.xml` indexé par Google Search Console.
- E2E Playwright (`apps/web/e2e/hotel-detail.spec.ts`, `e2e/destination.spec.ts`) qui valide les URLs flat.

Une migration `/hotel/[slug]` → `/hotels/[pays]/[ville]/[slug]` impliquerait :

- 301 généralisé table-driven (`Redirects` Payload).
- Refonte `generateStaticParams` (lookup city + country pour chaque hotel).
- Refonte de tous les sitemaps + ré-indexation Search Console.
- Risque SEO réel sur un domaine jeune (Google met 4-8 semaines à digérer une migration massive — perte de trafic provisoire).

## Alternative considérée

**Migrer vers `/hotels/[pays]/[ville]/[slug]` comme le CDC §3.3 le demande.** Rejeté :

- Études SEO récentes (Moz Beginner's Guide 2025, Ahrefs slug study 2024) montrent que les **slugs courts < 60 chars rankent mieux sur mobile** que les paths profonds, à condition que le slug soit riche en mots-clés (`hotel-ritz-paris` contient déjà "Paris").
- Le hub géo `/destination/[city]` est déjà la page-pivot pour la requête "[ville]" — un path profond ferait doublon avec lui (cannibalisation potentielle, voir `seo-technical/SKILL.md` §Anti-cannibalisation).
- Les fiches font appel à `Hotel.address` (`addressLocality`, `addressCountry`) + `Place.geo` dans le JSON-LD : l'information géo est déjà exposée aux crawlers structurés, l'URL n'a pas besoin de la dupliquer.
- Booking, Hotels.com et Tripadvisor utilisent eux-mêmes des URLs courtes (`booking.com/hotel/fr/ritz-paris.html`) — la profondeur n'est pas un signal SEO actif chez les majors.

## Conséquences

### Positives

- **Pas de migration coûteuse** : zéro 301 généralisé, zéro réindexation Search Console.
- **Slugs plus partageables** (URL courte = mieux pour réseaux sociaux + presse).
- **ADR-0007 reste valide** sans patch.
- **Sitemaps plus simples** : un sitemap par type d'entité (hotels, rooms, hubs, editorial) plutôt qu'une arborescence pays/ville à maintenir.
- **Sous-pages chambres** héritent d'un path naturel (`/hotel/[slug]/chambres/[room-slug]`) plutôt que d'une path trop profonde (`/hotels/fr/paris/ritz/chambres/suite-coco`).

### Négatives

- **Divergence assumée vs CDC** : doit être tracée explicitement dans `seo-technical/SKILL.md` (fait) et `hotel-detail-page.mdc` (fait).
- Si un jour ConciergeTravel s'ouvre à plusieurs pays, on devra envisager `/hotel/<country>/<slug>` ou un sous-domaine pays (`fr.conciergetravel.fr`) — pas un blocker court terme (V1 = France seulement).

## Plan de rollback

Si Google Search Console montre une **stagnation > 6 mois** des impressions/clics sur les fiches palace (top 20), nous étudierons la bascule vers `/hotels/[pays]/[ville]/[slug]` en V2. Étapes :

1. Migration table-driven via `Redirects` Payload (301 systématique).
2. Mise à jour `generateStaticParams` + sitemap.
3. Re-soumission Search Console + monitoring 90 jours.

Le seuil et le plan sont également documentés dans `seo-technical/SKILL.md`.

## Validation

- Search Console : monitorer trimestriellement les impressions / position moyenne / CTR sur top 50 fiches.
- Lighthouse SEO score reste ≥ 95 sur fiches palace (slug court ne pénalise pas).
- Aucun signal Google Manual Action lié à URL structure.
