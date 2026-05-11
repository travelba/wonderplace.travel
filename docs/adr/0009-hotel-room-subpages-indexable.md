# ADR 0009 — Sous-pages chambres indexables `/hotel/[slug]/chambres/[room-slug]`

- Status: accepted
- Date: 2026-05-11
- Refs: skill `content-modeling`, skill `structured-data-schema-org`, rule `hotel-detail-page`, ADR-0008, CDC v3.0 §2.5

## Décision

Chaque **type de chambre** d'un hôtel (pas chaque chambre individuelle) devient une **page indexable autonome** à l'URL `/hotel/[slug]/chambres/[room-slug]`.

Caractéristiques :

- ISR `revalidate = 3600` alignée sur la fiche parent.
- Canonical strict vers elle-même (jamais vers la fiche parent).
- Schema.org : `HotelRoom` (ou `Room`) + `Offer` + `BreadcrumbList` + `ImageObject[]` (≥ 5) + `isPartOf` référençant le `Hotel` parent via `@id`.
- Bidirectional internal linking obligatoire (fiche → chambre + chambre → fiche + chambre → chambres soeurs).
- Exclusion par défaut des `ItemList` JSON-LD `/destination/[city]` (anti-cannibalisation) — exception : `is_signature: true` pour les suites signature (Cap-Eden-Roc Suite, Cheval Blanc Penthouse, etc.).

## Contexte

Le CDC v3.0 §2.5 demande qu'une fiche hôtel expose chaque type de chambre comme une "sous-page indexable" avec ses propres URL, photos et `Offer`. La motivation principale est la **longue traîne SEO** : requêtes comme "suite avec jacuzzi vue mer Cannes", "chambre familiale Disneyland Paris", "junior suite Ritz Paris" représentent un volume cumulé non négligeable et sont aujourd'hui captées par les OTA.

État avant cette décision :

- Les chambres existent comme `<section>` interne dans `apps/web/src/app/[locale]/hotel/[slug]/page.tsx` (lignes 631-674).
- Pas de table standalone `rooms` côté Supabase (les chambres sont décrites en JSONB sur `hotels`).
- Pas de collection Payload `Rooms`.
- Pas de sitemap-rooms.xml.

Décision URL prise dans [ADR-0008](0008-url-structure-hotel-flat.md) : URL canonique `/hotel/[slug]` (slug court). Les sous-pages chambres héritent naturellement de ce path : `/hotel/[slug]/chambres/[room-slug]`.

## Alternative considérée

**Refuser les sous-pages chambres et conserver les chambres comme `<section>` interne de la fiche.** Rejeté pour les raisons suivantes :

- **Longue traîne perdue** : les requêtes "type-de-chambre + ville" ont peu de concurrence éditoriale (les OTA standardisent toutes leurs fiches) et représentent un volume cumulé important.
- **Différenciation vs OTA** : Booking met toutes les chambres sur une seule page. Avoir des fiches par chambre est un signal de profondeur éditoriale qui peut sortir favorablement.
- **Visite Matterport / vidéo dédiée par chambre** : impossible si la chambre n'est qu'un encart de fiche.

**Activer uniquement pour les Palaces / 5★ référencés (10-20 fiches max).** Rejeté : nous aurons besoin de la collection standalone `Rooms` de toute façon (pour le moteur de réservation + le mapping Amadeus offers), donc autant ouvrir l'indexabilité dès qu'une chambre passe les garde-fous éditoriaux ci-dessous.

## Garde-fous anti-cannibalisation

Une sous-page chambre ne respecte pas son potentiel SEO si elle copie la fiche parent. Les règles :

1. **Description chambre unique** : ≥ 200 mots **spécifiques à la chambre** (vue, surface, literie, équipements, vécu) — pas une paraphrase de la description hôtel.
2. **Canonical strict** : `alternates.canonical = '/hotel/[slug]/chambres/[room-slug]'`. **Jamais** vers le parent (cela annulerait l'indexabilité).
3. **Photos dédiées** : ≥ 5 photos prises dans la chambre (pas reprises de la galerie générale).
4. **Offer dédié** : un `Offer` distinct (tarif minimum de la chambre, `priceValidUntil` à 30 jours).
5. **Exclusion des `ItemList` `/destination/[city]`** : sauf `is_signature: true` (suites signature uniquement).
6. **`noindex` automatique** si description < 200 mots OU photos < 5 — la sous-page existe pour les humains mais ne s'expose pas à Google tant qu'elle est incomplète.
7. **Internal linking bidirectionnel** : la fiche hôtel liste toutes ses chambres avec ancre descriptive, chaque chambre renvoie vers la fiche parent + ses sibling rooms.

## Conséquences

### Positives

- **Surface SEO étendue** : N hôtels × M types de chambres = N×M pages indexables (potentiellement plusieurs centaines à terme).
- **Schema Offer/Room enrichi** : chaque sous-page expose une `Offer` propre, Google peut directement lier un type de chambre à un tarif dans les SERPs.
- **Visite 360° + vidéo par chambre** : possibilités UX premium.
- **Drive de conversion** : URL directe partageable depuis un email ou les réseaux sociaux (« Je vous propose la Junior Suite vue mer du Cap-Eden-Roc »).

### Négatives

- **Effort éditorial** : 200 mots unique × M chambres × N hôtels — ne s'écrira pas tout seul. Doit être priorisé : Palaces puis 5★ puis 4★.
- **Risque de cannibalisation** si les garde-fous ne sont pas tenus — nécessite des tests CI (description duplicate vs parent).
- **Audit Search Console** : surveiller que les sous-pages n'érodent pas la fiche parent sur sa requête principale (= nom de l'hôtel).

## Impacts techniques

À implémenter dans un plan ultérieur (= Phase 10) :

- Nouvelle table Supabase `rooms` (cf. `content-modeling/SKILL.md`).
- Nouvelle collection Payload `Rooms` avec hook `revalidateTag('room:<id>')`.
- Nouvelle route Next : `apps/web/src/app/[locale]/hotel/[slug]/chambres/[roomSlug]/page.tsx` (RSC, ISR 3600 s).
- Nouveau JSON-LD builder : `packages/seo/jsonld/hotel-room.ts`.
- Nouveau sitemap : `apps/web/src/app/sitemap-rooms.xml/route.ts`.
- Nouveau E2E Playwright : `apps/web/e2e/hotel-room.spec.ts`.
- Lint Payload : refuse publish si description < 200 mots OU photos < 5.

## Plan de rollback

Si nous observons une cannibalisation nette (perte de position sur la requête "[nom hôtel]" > 3 places en 6 mois) :

1. Passer en `noindex` global les sous-pages chambres.
2. Retirer le canonical strict pour rediriger vers la fiche parent (301 table-driven).
3. Conserver les pages comme surfaces internes (sticky liens depuis la fiche parent).

Ce plan préserve l'investissement éditorial même en cas de rollback.

## Validation

- Search Console : monitorer le couple fiche parent + sous-pages chambres trimestriellement.
- E2E : un test par chambre publiée valide canonical strict, photos ≥ 5, description ≥ 200 mots, internal linking bidirectionnel.
- Rich Results Test : valider le `HotelRoom` JSON-LD sur une sous-page de référence.
