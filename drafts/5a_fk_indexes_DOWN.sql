-- ════════════════════════════════════════════════════════════════════════
-- ROLLBACK Migration #5a — supprime les 13 index FK créés. Prêt à coller.
-- Date : 2026-06-01
-- ⚠️ DROP INDEX CONCURRENTLY ne peut PAS s'exécuter dans une transaction
--    → exécuter ligne par ligne dans le SQL Editor.
-- IDEMPOTENT : IF EXISTS.
-- ════════════════════════════════════════════════════════════════════════

DROP INDEX CONCURRENTLY IF EXISTS public.idx_brigade_commandes_recette_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_brigade_commandes_service_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_brigade_taches_assignee_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_brigade_taches_recette_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_brigade_taches_service_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_haccp_controls_template_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_pos_connections_created_by;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_pos_connections_provider_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_pos_item_recipe_mapping_matched_by;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_produits_fournisseur_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_reservations_created_by;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_sop_executions_operateur_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_ventes_historique_recette_id;
