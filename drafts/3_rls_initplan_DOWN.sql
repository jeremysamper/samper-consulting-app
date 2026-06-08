-- ════════════════════════════════════════════════════════════════════════
-- ROLLBACK Migration #3 — restaure les 7 policies À L'IDENTIQUE (auth.uid()
-- non enveloppé), exactement comme avant la migration. Prêt à coller.
-- Date : 2026-06-01
-- ATOMIQUE : une transaction. IDEMPOTENT : DROP IF EXISTS + CREATE.
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1) profiles.profiles_self_update
DROP POLICY IF EXISTS profiles_self_update ON public.profiles;
CREATE POLICY profiles_self_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = (auth.uid())::text);

-- 2) user_settings.users_can_read_own_settings
DROP POLICY IF EXISTS users_can_read_own_settings ON public.user_settings;
CREATE POLICY users_can_read_own_settings ON public.user_settings
  FOR SELECT TO public
  USING (auth.uid() = user_id);

-- 3) user_settings.users_can_write_own_settings
DROP POLICY IF EXISTS users_can_write_own_settings ON public.user_settings;
CREATE POLICY users_can_write_own_settings ON public.user_settings
  FOR ALL TO public
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4) factures_compteurs.consultants_can_read_compteurs
DROP POLICY IF EXISTS consultants_can_read_compteurs ON public.factures_compteurs;
CREATE POLICY consultants_can_read_compteurs ON public.factures_compteurs
  FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = (auth.uid())::text AND p.role = 'consultant'
  ));

-- 5) factures_compteurs.consultants_can_write_compteurs
DROP POLICY IF EXISTS consultants_can_write_compteurs ON public.factures_compteurs;
CREATE POLICY consultants_can_write_compteurs ON public.factures_compteurs
  FOR ALL TO public
  USING (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = (auth.uid())::text AND p.role = 'consultant'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = (auth.uid())::text AND p.role = 'consultant'
  ));

-- 6) module_labels.module_labels_select
DROP POLICY IF EXISTS module_labels_select ON public.module_labels;
CREATE POLICY module_labels_select ON public.module_labels
  FOR SELECT TO public
  USING (auth.uid() IS NOT NULL);

-- 7) alert_reads.alert_reads_own
DROP POLICY IF EXISTS alert_reads_own ON public.alert_reads;
CREATE POLICY alert_reads_own ON public.alert_reads
  FOR ALL TO public
  USING ((auth.uid())::text = user_id);

COMMIT;
