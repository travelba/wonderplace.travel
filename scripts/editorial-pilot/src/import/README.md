# Editorial pilot → Supabase import

Builds and pushes the 30-palace dataset into the public `hotels` table
consumed by the Next.js front office (`apps/web/src/app/[locale]/hotel/[slug]/page.tsx`).

## Pipeline

```
briefs-auto/<slug>.json + docs/editorial/pilots-auto/<slug>.md
            │
            ▼  build-import-sql.ts
out/seed-palaces.sql      (single transactional batch — 30 hotels)
out/seed-palaces.batch-01..06.sql  (5 hotels per batch, < 60 KB each)
            │
            ▼  push-import.ts (requires DATABASE_URL)
public.hotels             (idempotent ON CONFLICT (slug) DO UPDATE)
```

Both scripts are pure and reproducible: re-running `build-import-sql.ts`
regenerates the SQL deterministically from the briefs, and re-running
`push-import.ts` replays the upserts.

## Field mapping

| `hotels` column             | Brief source                                    |
| --------------------------- | ----------------------------------------------- |
| `slug`, `name`, `city`      | `brief.slug`, `brief.name`, `brief.city`        |
| `region`, `department`      | inferred from postal code (DEPT_TO_REGION map)  |
| `address`, `postal_code`    | parsed from `brief.address`                     |
| `latitude`, `longitude`     | `brief.coordinates.{lat,lng}`                   |
| `stars`, `is_palace`        | `brief.classification`                          |
| `booking_mode`              | `'display_only'` (vitrine seulement, pas d'API) |
| `priority`                  | `'P0'` (palace = top priority)                  |
| `is_published`              | `TRUE`                                          |
| `description_fr`            | first paragraph of editorial markdown           |
| `meta_title_fr/en`          | `<name> — Palace <city> \| ConciergeTravel`     |
| `meta_desc_fr`              | first 155 chars of description                  |
| `number_of_rooms`           | `brief.capacity.total_keys` / `rooms_count`     |
| `highlights` (jsonb)        | palace flag + capacity + Michelin + spa partner |
| `amenities` (jsonb)         | concierge / valet / spa / wellness flags        |
| `restaurant_info` (jsonb)   | `brief.dining` filtered on `type='restaurant'`  |
| `spa_info` (jsonb)          | `brief.wellness`                                |
| `faq_content` (jsonb)       | auto-generated FAQ from facts (5-7 questions)   |
| `awards` (jsonb)            | Palace Atout France + total Michelin stars      |
| `policies` (jsonb)          | check-in / check-out / pets / Wi-Fi             |
| `long_description_sections` | H2 sections from the editorial markdown         |

All JSONB shapes strictly follow the Zod schemas enforced by
`apps/web/src/server/hotels/get-hotel-by-slug.ts`.

## How to run

```pwsh
# 1. Build the SQL files (always idempotent)
pnpm --filter @cct/editorial-pilot exec tsx src/import/build-import-sql.ts

# 2. Push to Supabase (three options, choose one)

# Option A — pg client (preferred, fully automated)
$env:DATABASE_URL = "postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres"
pnpm --filter @cct/editorial-pilot exec tsx src/import/push-import.ts

# Option B — psql (if installed)
psql "$env:DATABASE_URL" -f scripts/editorial-pilot/out/seed-palaces.sql

# Option C — Supabase Studio (manual)
# Paste the contents of out/seed-palaces.sql into Project → SQL Editor → Run
```

## Verification

After pushing, run:

```sql
SELECT COUNT(*) FROM hotels WHERE is_published = TRUE;            -- expect 30+
SELECT slug, name, region, is_palace, number_of_rooms FROM hotels;
SELECT slug, jsonb_array_length(long_description_sections) AS sections,
              jsonb_array_length(faq_content) AS faqs
FROM hotels ORDER BY slug;
```

The Next.js hotel page (`/fr/hotel/<slug>`) consumes these rows
directly — once the upsert is done, navigate to e.g.
`/fr/hotel/cheval-blanc-courchevel` to validate the rendering.
