-- ════════════════════════════════════════════════════════════════════════
-- Migration #5a — Index sur les 13 FK non couvertes (advisor unindexed_foreign_keys)
-- Date : 2026-06-01  |  REVIEW-ONLY — NE PAS EXÉCUTER SANS VALIDATION
-- ════════════════════════════════════════════════════════════════════════
-- BUT : couvrir les colonnes FK sans index → JOINs et surtout suppressions
--       en cascade (ON DELETE CASCADE/SET NULL) plus rapides.
-- RISQUE : faible (purement additif, aucune logique d'accès touchée).
--
-- ⚠️ CONCURRENTLY ne peut PAS s'exécuter dans une transaction.
--    → Exécuter ces lignes UNE PAR UNE dans le SQL Editor Supabase
--      (PAS via un outil de migration qui enveloppe en BEGIN/COMMIT).
--    → Au volume actuel (tables ≤ 800 lignes) un CREATE INDEX simple
--      verrouille < 1 s ; si tu préfères, retire « CONCURRENTLY » et
--      exécute le tout en une transaction. CONCURRENTLY = zéro lock.
-- IDEMPOTENT : IF NOT EXISTS.
-- ════════════════════════════════════════════════════════════════════════

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_brigade_commandes_recette_id
  ON public.brigade_commandes(recette_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_brigade_commandes_service_id
  ON public.brigade_commandes(service_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_brigade_taches_assignee_id
  ON public.brigade_taches(assignee_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_brigade_taches_recette_id
  ON public.brigade_taches(recette_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_brigade_taches_service_id
  ON public.brigade_taches(service_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_haccp_controls_template_id
  ON public.haccp_controls(template_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pos_connections_created_by
  ON public.pos_connections(created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pos_connections_provider_id
  ON public.pos_connections(provider_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pos_item_recipe_mapping_matched_by
  ON public.pos_item_recipe_mapping(matched_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_produits_fournisseur_id
  ON public.produits(fournisseur_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reservations_created_by
  ON public.reservations(created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sop_executions_operateur_id
  ON public.sop_executions(operateur_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ventes_historique_recette_id
  ON public.ventes_historique(recette_id);
