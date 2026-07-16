-- ================================================================
-- MIGRATION J3 - POS MAPPING : matched_at + matched_by
-- Projet  : Samper Consulting
-- Date    : 2026-05-23
-- Changements :
--   • ADD COLUMN matched_at   ON pos_item_recipe_mapping
--   • ADD COLUMN matched_by   ON pos_item_recipe_mapping
--     (FK vers profiles.id, NULL si action système)
--
-- NOTE : recipe_id conserve ON DELETE CASCADE (validé J3-D1).
--        Suppression d'une recette → mapping disparu → pos_item
--        repasse en statut "à mapper" automatiquement.
-- ================================================================

ALTER TABLE public.pos_item_recipe_mapping
  ADD COLUMN IF NOT EXISTS matched_at  timestamptz,
  ADD COLUMN IF NOT EXISTS matched_by  text
    REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ================================================================
-- FIN MIGRATION 20260523_pos_mapping_j3.sql
-- ================================================================
