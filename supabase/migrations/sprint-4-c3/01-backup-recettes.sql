-- ════════════════════════════════════════════════════════════════
-- Sprint 4 · Chantier 3 · ÉTAPE 1 — Sauvegarde de la table recettes
-- ────────────────────────────────────────────────────────────────
-- À exécuter EN PREMIER dans Supabase SQL Editor, avant le matching.
-- Idempotent : la table de sauvegarde est recréée si le script est relancé.
-- ════════════════════════════════════════════════════════════════

DO $$
DECLARE
  n bigint;
BEGIN
  DROP TABLE IF EXISTS recettes_backup_sprint4;
  CREATE TABLE recettes_backup_sprint4 AS TABLE recettes;
  ALTER TABLE recettes_backup_sprint4 ADD COLUMN _backup_at timestamptz DEFAULT now();

  SELECT count(*) INTO n FROM recettes_backup_sprint4;
  RAISE NOTICE 'Sauvegarde OK : % recette(s) copiée(s) dans recettes_backup_sprint4', n;
END $$;

-- Vérification : doit renvoyer le même nombre de lignes que la table recettes.
SELECT
  (SELECT count(*) FROM recettes)                 AS recettes,
  (SELECT count(*) FROM recettes_backup_sprint4)  AS sauvegarde;
