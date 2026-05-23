-- ================================================================
-- MIGRATION — Table module_labels : labels de modules personnalisables
-- Projet : Samper Consulting
-- Date   : 2026-05-23
--
-- CONTEXTE :
-- Permet à chaque établissement (rôles consultant + patron) de
-- renommer les modules dans la navigation sans toucher au code.
-- La clé technique (module_key = navItem.id) est immuable côté code.
-- Seul le label affiché est stocké ici.
--
-- ADAPTATIONS vs spec brief :
--  • IDs en text (cohérent avec toutes les tables existantes)
--  • FK vers etablissements(id) en text (idem)
--  • RLS via user_can_access_etab() + current_user_role() (helpers existants)
--  • Pas de table etablissement_users — on utilise profiles.etablissement_ids
-- ================================================================

CREATE TABLE IF NOT EXISTS public.module_labels (
  id               text        PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  etablissement_id text        NOT NULL REFERENCES public.etablissements(id) ON DELETE CASCADE,
  module_key       text        NOT NULL,
  label            text        NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (etablissement_id, module_key)
);

-- Index sur etablissement_id pour les lookups de la nav (appelée à chaque render)
CREATE INDEX IF NOT EXISTS idx_module_labels_etab
  ON public.module_labels(etablissement_id);

ALTER TABLE public.module_labels ENABLE ROW LEVEL SECURITY;

-- Lecture : tout utilisateur ayant accès à l'établissement
CREATE POLICY module_labels_select ON public.module_labels
  FOR SELECT USING (user_can_access_etab(etablissement_id));

-- Écriture : consultant + patron uniquement
CREATE POLICY module_labels_insert ON public.module_labels
  FOR INSERT WITH CHECK (
    user_can_access_etab(etablissement_id)
    AND current_user_role() = ANY(ARRAY['consultant','patron'])
  );

CREATE POLICY module_labels_update ON public.module_labels
  FOR UPDATE
  USING (user_can_access_etab(etablissement_id)
         AND current_user_role() = ANY(ARRAY['consultant','patron']))
  WITH CHECK (user_can_access_etab(etablissement_id)
              AND current_user_role() = ANY(ARRAY['consultant','patron']));

CREATE POLICY module_labels_delete ON public.module_labels
  FOR DELETE USING (
    user_can_access_etab(etablissement_id)
    AND current_user_role() = ANY(ARRAY['consultant','patron'])
  );
