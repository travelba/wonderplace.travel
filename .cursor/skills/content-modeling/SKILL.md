---
name: content-modeling
description: Editorial content modeling for ConciergeTravel.fr (Payload collections, fields, relations, validation, draft/publish, multilingual content). Use when adding or modifying any Payload collection or content shape.
---

# Content modeling — ConciergeTravel.fr

The editorial layer is **first-class product surface**. Content must be reusable across hubs, fiches, and AI surfaces (cf. CDC §5.1, §6, §15). Modeled in **Payload CMS 3** (collections + globals) backed by Postgres on Supabase.

## Triggers

Invoke when:
- Adding/editing any Payload collection or global.
- Designing a new editorial template or section.
- Defining draft/publish lifecycle, scheduling, or localization fields.

## Collections

### `Hotels`
- Shadow of the `hotels` SQL table; Payload is the editing surface, Postgres holds the canonical record.
- Fields grouped: Identity, Location, Connectivity (booking_mode, IDs), Editorial (descriptions, highlights, FAQ), Media (images), SEO (meta, slugs FR/EN, canonical override), Reviews sync, Loyalty eligibility.
- Localized fields: `description`, `highlights`, `meta_title`, `meta_desc`, `faq_content`, `aeo_block`.
- Validation: `slug` unique, lowercase kebab-case, 60 chars max; coords within FR bounds (lat 41–52, lng -5–10).

### `EditorialPages`
- Types: `classement`, `thematique`, `region`, `guide`, `comparatif`, `saisonnier`.
- Fields: `slug` per locale, `title`, `meta_desc`, `aeo_block` (40–60 words), `intro` (rich text, max 200 words), `body` (Lexical/TipTap), `faq_content`, `last_updated`, `author`, `hotels` (m2m to Hotels for ItemList), `priority` (P0–P3), `status` (draft/published).
- Comparatifs require exactly 2 referenced hotels.

### `FaqEntries`
- Reusable Q/A library tagged by `topic` (`palace`, `cancellation`, `loyalty`, ...). Editorial pages can pull tagged entries OR define inline.

### `Authors`
- `name`, `slug`, `bio` (200 words), `expertise` (multi-tag), `socials` (LinkedIn, etc.), `photo`.

### `Media`
- Cloudinary-backed. Each upload requires `alt_text_fr/_en`, `credit`, `category` (exterior/lobby/room/spa/restaurant/view).

### `BookingRequestsEmail`
- Read/edit by operators only. Status workflow: `new → in_progress → quoted → booked | declined`.

### `Bookings`
- Read-only mirror of SQL (Payload custom adapter). Operator can add internal notes + cancel manually.

### `LoyaltyMembers`
- Read with admin privilege. Operator can adjust tier with audit log entry.

### `Redirects`
- `from`, `to`, `status_code` (301/302), `is_active`, `notes`. Projected into `next.config.ts` at build time.

## Globals

### `SiteSettings`
- Phone, email, IATA number, ASPST number, financial guarantee text, social links.

### `RobotsConfig`
- Allow/disallow rules, sitemap URLs (defaults set; editable for emergencies).

### `LlmsTxtSource`
- Editorial header, "à propos" block, curated strategic pages list (used by `/llms.txt` generator).

## Non-negotiable rules

### Localization
- Two locales: `fr` (default) and `en`. Localized fields are real `localized: true` Payload fields, not duplicate fields.
- All slugs validated for uniqueness per locale.

### Draft/publish
- Every editorial collection uses `versions: { drafts: true }`.
- Hooks on publish: revalidate Next.js tags (`hotel:<slug>`, `editorial:<slug>`, `hub:<region>`), reindex Algolia, append entry to `audit_logs`.

### Validation
- Zod schemas mirror Payload field validation in `apps/admin/src/validators/`.
- AEO blocks: `validate: (val) => wordCount(val) ≥ 40 && ≤ 60`.
- FAQ: at least 5 entries on classements / hotels.

### Media
- Required: ≥ 15 photos per published hotel (CDC §6.2). Validation blocks publish if < 15.
- Featured photo required (used as OG image fallback).

### Authoring guardrails
- Word-count target visible on the page editor (`packages/ui/admin/WordCounter`).
- Reading-level estimator for body (Flesch-French). Surface only as advisory.

### Cross-references
- Hub pages auto-include all hotels in their region published with priority P0/P1; manual override possible.
- Editorial pages link bidirectionally to listed hotels; the relation is materialized in `editorial_pages.hotel_ids` array.

## Anti-patterns to refuse

- Duplicating French and English as separate documents.
- Editing hotel fields outside Payload (no manual SQL writes from the app).
- Publishing without populating `aeo_block`, `faq_content`, `last_updated`.
- Using freeform HTML where structured fields exist.
- Storing inline image URLs not from Cloudinary.

## References

- CDC v3.0 §3.2 (i18n), §4 (data model), §6.2 (hotel anatomy), §11 (back-office).
- Excel sheets — Pages Éditoriales, Topic Clusters.
- `backoffice-cms`, `seo-technical`, `geo-llm-optimization` skills.
