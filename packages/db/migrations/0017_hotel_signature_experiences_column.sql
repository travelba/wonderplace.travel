-- 0017 — Hotel signature experiences.
--
-- Phase 10.13 (gap analysis Peninsula §12 — bloc "Expériences signature").
--
-- Stores a small ordered list of exclusive on-site programmes that
-- distinguish the property from a generic luxury hotel: in-house
-- transport fleets, member loyalty programmes, signature dining
-- rituals, in-residence arts programmes, etc. Surfaces as a 3-up
-- card grid on the public hotel page.
--
-- We keep this separate from the existing `restaurant_info` /
-- `spa_info` / `policies` / `long_description_sections` columns
-- because:
--   - Experiences are operationally distinct (often need a separate
--     booking flow), not a sub-fact of the spa or F&B blocks.
--   - The cards we render have a different visual treatment (image
--     + badge + CTA), so they need their own shape.
--   - Editorial workflow in Payload (Phase 8) will give experiences
--     their own collection or array field — keep the DB shape ready.
--
-- Shape (validated by Zod at the read boundary):
--
--   [
--     {
--       "key": "peninsula-time",
--       "title_fr": "Peninsula Time",
--       "title_en": "Peninsula Time",
--       "description_fr": "Check-in dès 6 h et check-out jusqu'à 22 h, sans frais supplémentaires.",
--       "description_en": "Check-in from 6 am and check-out until 10 pm, free of charge.",
--       "badge_fr": "Inclus",
--       "badge_en": "Included",
--       "booking_required": false,
--       "image_public_id": "cct/test/peninsula-paris/exterior-1"
--     },
--     …
--   ]
--
-- `key` is a stable identifier we use as React key + anchor; it
-- must be lowercase-kebab. Image references are Cloudinary
-- public_ids (same convention as the gallery).
--
-- Skill: supabase-postgres-rls (additive), content-modeling.

alter table public.hotels
  add column if not exists signature_experiences jsonb;

comment on column public.hotels.signature_experiences is
  'Ordered array of exclusive on-site experiences (key, title_fr/en, description_fr/en, badge?, booking_required, image_public_id?). See migration 0017 for shape.';
