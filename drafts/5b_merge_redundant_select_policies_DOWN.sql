-- ════════════════════════════════════════════════════════════════════════
-- ROLLBACK Migration #5b — recrée À L'IDENTIQUE les 6 policies SELECT
-- supprimées (mêmes noms, mêmes quals, role authenticated). Prêt à coller.
-- Date : 2026-06-01  |  ATOMIQUE : une transaction. IDEMPOTENT : DROP IF EXISTS.
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

DROP POLICY IF EXISTS kit_items_read ON public.kit_items;
CREATE POLICY kit_items_read ON public.kit_items
  FOR SELECT TO authenticated
  USING (user_can_access_etab(etablissement_id));

DROP POLICY IF EXISTS plats_read ON public.plats;
CREATE POLICY plats_read ON public.plats
  FOR SELECT TO authenticated
  USING (user_can_access_etab(etablissement_id));

DROP POLICY IF EXISTS pr_read ON public.plat_recettes;
CREATE POLICY pr_read ON public.plat_recettes
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM plats p
    WHERE p.id = plat_recettes.plat_id AND user_can_access_etab(p.etablissement_id)
  ));

DROP POLICY IF EXISTS sops_read ON public.sops;
CREATE POLICY sops_read ON public.sops
  FOR SELECT TO authenticated
  USING (user_can_access_etab(etablissement_id));

DROP POLICY IF EXISTS sopex_read ON public.sop_executions;
CREATE POLICY sopex_read ON public.sop_executions
  FOR SELECT TO authenticated
  USING (user_can_access_etab(etablissement_id));

DROP POLICY IF EXISTS sopss_read ON public.sop_step_states;
CREATE POLICY sopss_read ON public.sop_step_states
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM sop_executions e
    WHERE e.id = sop_step_states.execution_id AND user_can_access_etab(e.etablissement_id)
  ));

COMMIT;
