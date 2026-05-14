-- 0026 — Editorial guides + rankings (Phase 13: content engineering).
--
-- This migration adds two top-tier editorial surfaces beyond the
-- hotel fiches:
--
--   1. `editorial_guides` — long-form destination guides (≥ 1500
--      words FR + EN) for the 12-15 luxury-travel hotspots in France.
--      Each guide carries 6-9 editorial sections, an FAQ block, and
--      its own JSON-LD payload (`Article` + `TravelDestination`).
--      Routes: `/guide/[citySlug]` (or country-level, for future
--      international expansion).
--
--   2. `editorial_rankings` — curated "Top X" lists ("Les 10 plus
--      beaux Palaces de France", "Top Palaces avec spa Guerlain",
--      "Les Palaces Michelin 3 étoiles"…). Each ranking carries an
--      intro 400-600 words, a justification per entry, and emits
--      `ItemList` + `Article` JSON-LD.
--      Routes: `/classement/[slug]`.
--
-- Why two tables and not a single `editorial_content` polymorphic
-- table?
--   - Different lifecycles: guides are refreshed yearly; rankings
--     quarterly.
--   - Different FK shapes: rankings have an ordered FK list to
--     hotels (with editorial rank + justification); guides just
--     reference the city.
--   - Different SEO contracts: guides aim at TravelDestination
--     intent; rankings at "best of" intent — emitted as distinct
--     Schema.org graphs.
--
-- Bilingual: every content column has `_fr` + `_en` siblings so
-- the same row drives both locale routes (mirrors the `hotels`
-- table convention). Null `_en` columns trigger the "fr-only"
-- fallback on the public page (banner: "English version coming
-- soon"); they NEVER break the route.
--
-- Skill: content-modeling, seo-technical, geo-llm-optimization.

-- ============================================================================
-- editorial_guides
-- ============================================================================

create table if not exists public.editorial_guides (
  id uuid primary key default gen_random_uuid(),
  -- URL-stable slug (kebab-case ASCII). Joined with the existing
  -- `cities` table when available (see `apps/web/src/server/destinations/cities.ts`)
  -- but kept loose — a `paris-rive-gauche` guide doesn't need a
  -- matching city row.
  slug text not null unique,
  -- Display name (`Paris`, `Côte d'Azur`, `Courchevel`…). Surfaces
  -- in <h1>, breadcrumbs and meta. Bilingual.
  name_fr text not null,
  name_en text,
  -- Geographic scope:
  --   - 'city'        — one city / locality
  --   - 'region'      — a French administrative region
  --   - 'cluster'     — editorial cluster (Côte d'Azur, Alpes…)
  --   - 'country'     — country-wide (future international)
  scope text not null default 'city'
    check (scope in ('city', 'region', 'cluster', 'country')),
  -- Country code (ISO 3166-1 alpha-2). Defaults to FR for the
  -- current French-only catalog; future Italy / Switzerland guides
  -- will store 'IT' / 'CH'.
  country_code text not null default 'FR'
    check (country_code ~ '^[A-Z]{2}$'),
  -- Editorial summary surfaced on the index card AND in the
  -- `meta_description` tag. 150-180 chars sweet spot.
  summary_fr text not null,
  summary_en text,
  -- Full long-form content. Stored as JSONB array of typed sections:
  --   [{ key, title_fr, title_en, body_fr, body_en, type }]
  -- Section types: 'intro', 'history', 'when_to_visit', 'what_to_see',
  -- 'gastronomy', 'transports', 'shopping', 'art_de_vivre', 'palaces',
  -- 'practical', 'conclusion'.
  sections jsonb not null default '[]'::jsonb,
  -- Frequently asked questions about the destination — surfaced as
  -- `FAQPage` JSON-LD on the guide page.
  --   [{ question_fr, question_en, answer_fr, answer_en, category }]
  faq jsonb not null default '[]'::jsonb,
  -- Editorial pull-quotes from press (Condé Nast, Forbes, Guide
  -- du Routard…). Same shape as `hotels.featured_reviews`.
  featured_reviews jsonb not null default '[]'::jsonb,
  -- Curated cluster of nearby attractions / experiences (≠ POIs
  -- which are hotel-local). 6-12 entries with name, type, short
  -- description, optional URL.
  highlights jsonb not null default '[]'::jsonb,
  -- Practical info block: when to visit, currency, language,
  -- airport(s), train stations. Stored as structured JSON so the
  -- page can render a side panel and the AEO answer-rapide block.
  practical_info jsonb,
  -- Cover image (Cloudinary `public_id` like `editorial/paris-eiffel`).
  hero_image text,
  -- Optional gallery — 4-6 wide images for the in-content carousel.
  gallery_images jsonb,
  -- ISO-8601 `YYYY-MM-DD` editorial date (last review). Drives
  -- `dateModified` in JSON-LD + the visible "Mis à jour le..." line.
  reviewed_at date,
  -- Editorial author display name + URL (link to a future
  -- `/equipe/[slug]` page). Optional.
  author_name text,
  author_url text,
  -- SEO overrides (rare — only when the editorial team wants to
  -- diverge from the default `{name_fr} — Guide Voyage Luxe…`).
  meta_title_fr text,
  meta_title_en text,
  meta_desc_fr text,
  meta_desc_en text,
  -- Publication state. `is_published = false` rows are draft-only
  -- in Payload and 404 on the public route.
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Slug shape constraint (mirrors `hotels.slug` CHECK from 0001).
  constraint editorial_guides_slug_ck
    check (slug ~ '^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$'),
  -- Summary length sanity (Google's meta-description sweet spot).
  constraint editorial_guides_summary_fr_ck
    check (char_length(summary_fr) between 60 and 220)
);

comment on table public.editorial_guides is
  'Long-form destination guides (≥1500 words) for /guide/[slug]. '
  'Migration 0026 — content-engineering phase.';

create index if not exists editorial_guides_published_idx
  on public.editorial_guides (is_published)
  where is_published = true;

create index if not exists editorial_guides_country_scope_idx
  on public.editorial_guides (country_code, scope)
  where is_published = true;

-- Auto-update `updated_at` on every UPDATE.
create or replace function public.editorial_guides_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists editorial_guides_touch_updated_at on public.editorial_guides;
create trigger editorial_guides_touch_updated_at
  before update on public.editorial_guides
  for each row execute function public.editorial_guides_touch_updated_at();

-- RLS: public can read only published rows; service-role bypasses.
alter table public.editorial_guides enable row level security;

drop policy if exists editorial_guides_select_published on public.editorial_guides;
create policy editorial_guides_select_published
  on public.editorial_guides
  for select
  to anon, authenticated
  using (is_published = true);

-- ============================================================================
-- editorial_rankings
-- ============================================================================

create table if not exists public.editorial_rankings (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  -- Bilingual headline ("Les 10 plus beaux Palaces de France").
  title_fr text not null,
  title_en text,
  -- Editorial kind — drives the JSON-LD shape on the public page.
  --   'best_of'      — Top X / "Les meilleurs…" — emits ItemList[Hotel]
  --   'awarded'      — distinction-based ("Michelin 3★", "Atout France")
  --   'thematic'     — theme-based ("Spa Guerlain", "Vignobles")
  --   'geographic'   — geo-based ("Top Palaces de Paris")
  kind text not null default 'best_of'
    check (kind in ('best_of', 'awarded', 'thematic', 'geographic')),
  -- Long-form intro (400-600 words) explaining the ranking
  -- methodology + scope. Bilingual.
  intro_fr text not null,
  intro_en text,
  -- Conclusion / closing block (optional).
  outro_fr text,
  outro_en text,
  -- Frequently asked questions about the ranking topic — surfaced as
  -- `FAQPage` JSON-LD.
  faq jsonb not null default '[]'::jsonb,
  -- Cover hero image (Cloudinary `public_id`).
  hero_image text,
  -- SEO overrides.
  meta_title_fr text,
  meta_title_en text,
  meta_desc_fr text,
  meta_desc_en text,
  reviewed_at date,
  author_name text,
  author_url text,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint editorial_rankings_slug_ck
    check (slug ~ '^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$'),
  constraint editorial_rankings_intro_fr_ck
    check (char_length(intro_fr) between 400 and 8000)
);

comment on table public.editorial_rankings is
  'Top X / Best-of editorial rankings for /classement/[slug]. '
  'Migration 0026 — content-engineering phase.';

create index if not exists editorial_rankings_published_idx
  on public.editorial_rankings (is_published)
  where is_published = true;

create or replace function public.editorial_rankings_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists editorial_rankings_touch_updated_at on public.editorial_rankings;
create trigger editorial_rankings_touch_updated_at
  before update on public.editorial_rankings
  for each row execute function public.editorial_rankings_touch_updated_at();

alter table public.editorial_rankings enable row level security;

drop policy if exists editorial_rankings_select_published on public.editorial_rankings;
create policy editorial_rankings_select_published
  on public.editorial_rankings
  for select
  to anon, authenticated
  using (is_published = true);

-- ============================================================================
-- editorial_ranking_entries
-- Join table — one row per (ranking × hotel) with the editorial rank
-- (1, 2, 3…) and the justification text. The hotel FK is the source
-- of truth for the displayed properties; this table only carries the
-- editorial ordering + explanation.
-- ============================================================================

create table if not exists public.editorial_ranking_entries (
  ranking_id uuid not null references public.editorial_rankings(id) on delete cascade,
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  rank smallint not null check (rank >= 1 and rank <= 100),
  -- 1-3 sentence justification of the rank — surfaces under each
  -- hotel card on the ranking page AND in the per-entry JSON-LD
  -- `Hotel.description`.
  justification_fr text not null,
  justification_en text,
  -- Optional editorial highlight ("Le sacre absolu", "Mention
  -- spéciale Spa") — surfaces as a badge on the card.
  badge_fr text,
  badge_en text,
  created_at timestamptz not null default now(),
  primary key (ranking_id, hotel_id),
  constraint editorial_ranking_entries_unique_rank
    unique (ranking_id, rank) deferrable initially deferred,
  constraint editorial_ranking_entries_justification_fr_ck
    check (char_length(justification_fr) between 40 and 1200)
);

comment on table public.editorial_ranking_entries is
  'Ordered hotel entries inside an editorial ranking. Migration 0026.';

create index if not exists editorial_ranking_entries_ranking_idx
  on public.editorial_ranking_entries (ranking_id, rank);
create index if not exists editorial_ranking_entries_hotel_idx
  on public.editorial_ranking_entries (hotel_id);

alter table public.editorial_ranking_entries enable row level security;

-- Public read: only entries pointing at a published ranking AND a
-- published hotel. The join is enforced by the RLS predicate so the
-- API never leaks unpublished assignments.
drop policy if exists editorial_ranking_entries_select_published on public.editorial_ranking_entries;
create policy editorial_ranking_entries_select_published
  on public.editorial_ranking_entries
  for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.editorial_rankings r
      where r.id = ranking_id and r.is_published = true
    )
    and exists (
      select 1 from public.hotels h
      where h.id = hotel_id and h.is_published = true
    )
  );
