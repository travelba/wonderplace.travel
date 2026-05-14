-- 0029 — Editorial rankings: classification axes (matrice combinatorial).
--
-- Adds a structured `axes` JSONB column to `editorial_rankings` so
-- the front-end facetted hub (`/classements`) and sub-hubs
-- (`/classements/[axe]/[valeur]`) can query the catalog by:
--   - hotel type (palace, 5-etoiles, chateau, chalet, …)
--   - lieu (france, paris, cote-d-azur, courchevel, …)
--   - themes (spa-bienetre, gastronomie, romantique, …)
--   - occasions (week-end, lune-de-miel, seminaire, …)
--   - saison (toute-annee, ete, hiver, …)
--
-- Shape (mirrors `RankingAxesSchema` in
-- `scripts/editorial-pilot/src/rankings/axes.ts`):
--   {
--     "types": ["palace", "5-etoiles"],
--     "lieu": { "scope": "ville", "slug": "paris", "label": "Paris" },
--     "themes": ["spa-bienetre", "romantique"],
--     "occasions": ["lune-de-miel"],
--     "saison": "toute-annee"
--   }
--
-- Why JSONB and not normalized lookup tables?
--   - Read-only on the public site — no aggregation or join needed
--     beyond a single `editorial_rankings` SELECT.
--   - Each ranking has 0-N tags per axis; flattening to relational
--     would mean 4 join tables for ~200 rows. Not worth it.
--   - The full taxonomy lives in TypeScript (axes.ts) and is mirrored
--     here only as denormalized labels. The truth-source is the code,
--     never the DB.
--
-- The `gin (axes jsonb_path_ops)` index supports `@>` containment
-- queries from the facetted hub:
--   select slug, title_fr from public.editorial_rankings
--   where axes @> '{"types": ["palace"]}'::jsonb
--     and axes @> '{"lieu": {"slug": "paris"}}'::jsonb;
--
-- Skill: content-modeling, supabase-postgres-rls, seo-technical.

alter table public.editorial_rankings
  add column if not exists axes jsonb not null default '{}'::jsonb;

create index if not exists editorial_rankings_axes_gin
  on public.editorial_rankings
  using gin (axes jsonb_path_ops);

comment on column public.editorial_rankings.axes is
  'Classification axes (types, lieu, themes, occasions, saison) used by '
  'the facetted hub /classements and sub-hubs /classements/[axe]/[valeur]. '
  'Shape mirrors RankingAxesSchema in scripts/editorial-pilot/src/rankings/axes.ts. '
  'GIN index supports @> containment queries.';

insert into public._cct_sql_migrations (filename, applied_at)
  values ('0029_editorial_rankings_axes.sql', now())
  on conflict do nothing;
