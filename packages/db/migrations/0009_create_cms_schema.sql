-- 0009 — Create dedicated `cms` schema for Payload-managed tables.
--
-- Phase 8 (chantier D du plan B+C+D). Payload CMS 3 boote avec son propre
-- adapter Drizzle qui synchronise un schéma en `push` mode en dev. Pour
-- éviter tout chevauchement avec les tables `public.*` gérées par nos
-- migrations SQL canoniques (source de vérité applicative), on isole
-- *toutes* les tables Payload sous un schéma dédié `cms`.
--
-- ADR: docs/adr/0003-payload-cms.md (Postgres = source de vérité),
--      docs/adr/0010-payload-dual-table-mirror.md (stratégie de sync).
--
-- Conséquences:
--   * Payload va créer `cms.users`, `cms.hotels`, `cms.payload_migrations`,
--     `cms.payload_locked_documents`, etc. Aucune collision possible avec
--     `public.hotels`, `public.profiles`, etc.
--   * Le sync `cms.hotels → public.hotels` reste à implémenter
--     (Phase 8.1) via un `afterChange` hook côté Payload.
--   * `disableCreateDatabase: true` est positionné sur l'adapter côté
--     `apps/admin` car la base est déjà créée par Supabase.
--
-- Skill: backoffice-cms + supabase-postgres-rls.

create schema if not exists cms;

comment on schema cms is
  'Payload CMS 3 managed schema. All tables created/altered by `@payloadcms/db-postgres` live here. Do NOT add migration-managed tables to this schema — use `public` for canonical app data.';
