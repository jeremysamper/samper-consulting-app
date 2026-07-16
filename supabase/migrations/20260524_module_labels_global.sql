-- ================================================================
-- MIGRATION - module_labels : portée globale (suppression etablissement_id)
-- Projet : Samper Consulting
-- Date   : 2026-05-24
--
-- CONTEXTE :
-- La table a été créée avec une colonne etablissement_id - chaque label
-- était scopé par établissement. Le comportement voulu est différent :
-- un label renommé doit s'appliquer globalement à tous les établissements.
--
-- CHANGEMENTS :
--   • Suppression de la colonne etablissement_id
--   • Nouvelle contrainte UNIQUE sur module_key seul
--   • RLS simplifiée : lecture pour tous les utilisateurs connectés,
--     écriture pour consultant + patron (décision globale)
-- ================================================================

-- 1. Drop de l'ancienne contrainte UNIQUE (etablissement_id, module_key)
--    PostgreSQL auto-génère le nom tablename_col1_col2_key
ALTER TABLE public.module_labels
  DROP CONSTRAINT IF EXISTS module_labels_etablissement_id_module_key_key;

-- 2. Suppression de la colonne etablissement_id (et sa FK implicite)
ALTER TABLE public.module_labels
  DROP COLUMN IF EXISTS etablissement_id;

-- 3. Nouvelle contrainte UNIQUE sur module_key seul
ALTER TABLE public.module_labels
  ADD CONSTRAINT module_labels_module_key_unique UNIQUE (module_key);

-- 4. Suppression de l'index sur etablissement_id (devenu caduque)
DROP INDEX IF EXISTS idx_module_labels_etab;

-- 5. Mise à jour des politiques RLS
DROP POLICY IF EXISTS module_labels_select ON public.module_labels;
DROP POLICY IF EXISTS module_labels_insert ON public.module_labels;
DROP POLICY IF EXISTS module_labels_update ON public.module_labels;
DROP POLICY IF EXISTS module_labels_delete ON public.module_labels;

-- Lecture : tout utilisateur authentifié (labels visibles dans toute l'app)
CREATE POLICY module_labels_select ON public.module_labels
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Écriture : consultant + patron uniquement (décision globale)
CREATE POLICY module_labels_write ON public.module_labels
  FOR ALL
  USING (current_user_role() = ANY(ARRAY['consultant', 'patron']))
  WITH CHECK (current_user_role() = ANY(ARRAY['consultant', 'patron']));
