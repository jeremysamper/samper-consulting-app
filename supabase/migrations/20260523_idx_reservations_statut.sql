-- ================================================================
-- MIGRATION - Index perf réservations : (etablissement_id, date_service, statut)
-- Projet : Samper Consulting
-- Date   : 2026-05-23
--
-- CONTEXTE :
-- Le trigger fn_update_previsions_from_reservations et le trigger
-- fn_update_tags_critiques filtrent les réservations par :
--   WHERE etablissement_id = X AND date_service = Y
--         AND statut NOT IN ('annule', 'no_show')
--
-- L'index composite (etablissement_id, date_service) existant couvre
-- les deux premières colonnes. Ajouter statut permet de satisfaire
-- le filtre statut NOT IN en index-only scan (évite heap fetch pour
-- les réservations annulées/no-show quand la table grossit).
--
-- Impact immédiat : marginal (peu de lignes aujourd'hui).
-- Impact production : significatif quand la table dépasse ~50k lignes.
-- ================================================================

CREATE INDEX IF NOT EXISTS idx_reservations_etab_date_statut
  ON public.reservations(etablissement_id, date_service, statut);
