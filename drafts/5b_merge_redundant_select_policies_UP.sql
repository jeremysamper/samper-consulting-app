-- ════════════════════════════════════════════════════════════════════════
-- Migration #5b — Fusion CONSERVATRICE des policies permissives redondantes
-- Date : 2026-06-01  |  REVIEW-ONLY — NE PAS EXÉCUTER SANS VALIDATION
-- ════════════════════════════════════════════════════════════════════════
-- CONTEXTE : advisor `multiple_permissive_policies`. Sur ces tables, une
--   policy `*_write` FOR ALL + une policy `*_read` FOR SELECT coexistent.
--   FOR ALL couvre DÉJÀ le SELECT (clause USING), donc pour le SELECT deux
--   policies permissives sont évaluées (OR) → le lint.
--
-- ON NE TRAITE QUE LE CAS 100 % SÛR : tables où la qual du `*_read` (SELECT)
--   est STRICTEMENT IDENTIQUE à la qual USING du `*_write` (ALL). Dans ce cas,
--   supprimer la policy SELECT redondante laisse le SELECT régi par la même
--   qual (via la policy ALL) → ACCÈS RIGOUREUSEMENT IDENTIQUE.
--
-- ⛔ NON TRAITÉES ICI (read VOLONTAIREMENT plus large que write → fusionner
--    NARROWERAIT l'accès = blocage) : alert_rules, app_settings,
--    consultant_messages, etablissements, module_labels, permissions, profiles.
--    (cf. README, grille d'analyse). On les laisse telles quelles.
--
-- ⛔ factures_compteurs / user_settings : exclues — traitées par #3.
--
-- RISQUE : faible MAIS touche la RLS → tester les 5 rôles en lecture après coup
--          sur kit_items / plats / plat_recettes / sops / sop_executions /
--          sop_step_states (la lecture doit rester identique à avant).
-- IDEMPOTENT : DROP IF EXISTS. ATOMIQUE : une transaction.
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- Pour chacune : la policy `*_write` FOR ALL (USING = user_can_access_etab/EXISTS)
-- reste en place et continue de régir SELECT + INSERT/UPDATE/DELETE à l'identique.

DROP POLICY IF EXISTS kit_items_read ON public.kit_items;        -- USING = user_can_access_etab(etablissement_id) == kit_items_write
DROP POLICY IF EXISTS plats_read      ON public.plats;           -- == plats_write
DROP POLICY IF EXISTS pr_read         ON public.plat_recettes;   -- == pr_write (EXISTS plats…)
DROP POLICY IF EXISTS sops_read       ON public.sops;            -- == sops_write
DROP POLICY IF EXISTS sopex_read      ON public.sop_executions;  -- == sopex_write
DROP POLICY IF EXISTS sopss_read      ON public.sop_step_states; -- == sopss_write (EXISTS sop_executions…)

COMMIT;
