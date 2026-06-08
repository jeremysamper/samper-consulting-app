-- ════════════════════════════════════════════════════════════════════════
-- Migration #3 — RLS initplan : (select auth.uid()) au lieu de auth.uid()
-- Date : 2026-06-01  |  REVIEW-ONLY — NE PAS EXÉCUTER SANS VALIDATION
-- ════════════════════════════════════════════════════════════════════════
-- BUT : supprimer la ré-évaluation PAR LIGNE de auth.uid() dans 7 policies
--       (advisor `auth_rls_initplan`). En enveloppant auth.uid() dans un
--       sous-select scalaire, Postgres l'évalue UNE fois (InitPlan) au lieu
--       d'une fois par ligne.
--
-- INVARIANT : la LOGIQUE d'accès est strictement identique — on ne change que
--             le NOMBRE d'évaluations. Chaque expression reste sémantiquement
--             la même (mêmes colonnes, mêmes comparaisons, mêmes rôles).
--
-- IDEMPOTENT : DROP POLICY IF EXISTS puis CREATE. Rejouable sans erreur.
-- ATOMIQUE   : à exécuter dans UNE transaction (les DROP/CREATE sont alors
--              invisibles aux autres sessions jusqu'au COMMIT — aucun trou RLS).
--
-- NB : on NE touche PAS user_can_access_etab() ni les ~26 policies qui
--      l'appellent (cf. README — wrap inutile sous SECURITY DEFINER, et
--      réécrire 26 tables = risque disproportionné au volume actuel).
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1) profiles.profiles_self_update  (UPDATE, role authenticated)
DROP POLICY IF EXISTS profiles_self_update ON public.profiles;
CREATE POLICY profiles_self_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = (select auth.uid())::text);

-- 2) user_settings.users_can_read_own_settings  (SELECT, public)
DROP POLICY IF EXISTS users_can_read_own_settings ON public.user_settings;
CREATE POLICY users_can_read_own_settings ON public.user_settings
  FOR SELECT TO public
  USING ((select auth.uid()) = user_id);

-- 3) user_settings.users_can_write_own_settings  (ALL, public)
DROP POLICY IF EXISTS users_can_write_own_settings ON public.user_settings;
CREATE POLICY users_can_write_own_settings ON public.user_settings
  FOR ALL TO public
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- 4) factures_compteurs.consultants_can_read_compteurs  (SELECT, public)
DROP POLICY IF EXISTS consultants_can_read_compteurs ON public.factures_compteurs;
CREATE POLICY consultants_can_read_compteurs ON public.factures_compteurs
  FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = (select auth.uid())::text AND p.role = 'consultant'
  ));

-- 5) factures_compteurs.consultants_can_write_compteurs  (ALL, public)
DROP POLICY IF EXISTS consultants_can_write_compteurs ON public.factures_compteurs;
CREATE POLICY consultants_can_write_compteurs ON public.factures_compteurs
  FOR ALL TO public
  USING (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = (select auth.uid())::text AND p.role = 'consultant'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = (select auth.uid())::text AND p.role = 'consultant'
  ));

-- 6) module_labels.module_labels_select  (SELECT, public)
DROP POLICY IF EXISTS module_labels_select ON public.module_labels;
CREATE POLICY module_labels_select ON public.module_labels
  FOR SELECT TO public
  USING ((select auth.uid()) IS NOT NULL);

-- 7) alert_reads.alert_reads_own  (ALL, public — with_check hérité de USING)
DROP POLICY IF EXISTS alert_reads_own ON public.alert_reads;
CREATE POLICY alert_reads_own ON public.alert_reads
  FOR ALL TO public
  USING ((select auth.uid())::text = user_id);

COMMIT;
