-- 0012 — Hotel policies (jsonb).
--
-- Phase 10.3 (gap analysis Peninsula §14 — score 0/5 → 4/5 once shipped).
-- Display-only and email-mode hotels still need structured policies so that:
--   * Travellers can read consistent check-in/check-out, cancellation,
--     pets, children and payment rules before contacting the concierge.
--   * The AEO/LLM block can quote exact times and conditions instead of
--     paraphrasing the editorial description.
--   * The booking tunnel (later, for amadeus/little modes) can lean on
--     the same structure to render the "Politique d'annulation" block in
--     the récap step.
--
-- Shape (validated by Zod in the app):
--   {
--     "check_in":    { "from": "15:00", "until?": "23:00" },
--     "check_out":   { "until": "12:00" },
--     "cancellation": {
--        "summary_fr?": "Annulation gratuite jusqu'à 48 h avant l'arrivée",
--        "summary_en?": "Free cancellation until 48 h before arrival",
--        "free_until_hours?": 48,
--        "penalty_after_fr?": "Une nuit débitée si annulation tardive",
--        "penalty_after_en?": "One night charged if cancelled late"
--     },
--     "pets":        { "allowed": true,  "fee_eur?": 0,
--                      "notes_fr?": "...", "notes_en?": "..." },
--     "children":    { "welcome": true,
--                      "free_under_age?": 12,
--                      "extra_bed_fee_eur?": 80,
--                      "notes_fr?": "...", "notes_en?": "..." },
--     "payment":     { "methods": ["visa", "mc", "amex", "apple_pay", ...],
--                      "deposit_required?": false,
--                      "notes_fr?": "...", "notes_en?": "..." }
--   }
--
-- All sub-fields optional; the app renders only the populated branches.
--
-- Skill: supabase-postgres-rls (additive, no RLS change) + content-modeling.

alter table public.hotels
  add column if not exists policies jsonb;

create index if not exists hotels_policies_gin
  on public.hotels using gin (policies jsonb_path_ops);

comment on column public.hotels.policies is
  'Structured policies: check_in/check_out, cancellation, pets, children, payment. See migration 0012 for shape.';
