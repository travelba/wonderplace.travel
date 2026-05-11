-- 0008 — Hotel media columns (hero + gallery).
--
-- Phase 10 chantier C: la fiche hôtel rendait une seule image générique car
-- la table `public.hotels` n'avait aucune colonne dédiée au média de niveau
-- hôtel (gap analysis Peninsula §2 bloc 2, score 0/5 — bloquant publication
-- d'un palace).
--
-- On ajoute:
--   * `hero_image` (text) — Cloudinary public_id de l'image hero LCP-critique.
--   * `gallery_images` (jsonb) — tableau d'objets
--       { public_id, alt_fr, alt_en, category? } pour le carousel/grid CDC §2.2.
--
-- Les colonnes sont NULLables: les hôtels existants ne sont pas brisés et la
-- fiche tombe gracieusement en fallback (placeholder) si l'éditeur n'a pas
-- encore peuplé le média.
--
-- Skill: supabase-postgres-rls (nullable additive, no RLS change) + content-modeling.

alter table public.hotels
  add column if not exists hero_image text,
  add column if not exists gallery_images jsonb;

-- GIN index for future filtering by category (e.g. "fiches avec photo spa")
-- ou recherche de visuels manquants par l'éditorial.
create index if not exists hotels_gallery_images_gin
  on public.hotels using gin (gallery_images jsonb_path_ops);

comment on column public.hotels.hero_image is
  'Cloudinary public_id (e.g. "cct/hotels/peninsula-paris/exterior-1"). NULL = pas de hero, fallback placeholder.';
comment on column public.hotels.gallery_images is
  'Array of { public_id: string, alt_fr?: string, alt_en?: string, category?: string } describing the editorial gallery. Empty/NULL = no gallery.';
