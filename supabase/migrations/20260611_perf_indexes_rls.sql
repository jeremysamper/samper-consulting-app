-- ════════════════════════════════════════════════════════════════════════════
-- Optimisations performance (additif, non destructif fonctionnellement)
--   1. Index sur les cles etrangeres non couvertes (advisor: unindexed_foreign_keys)
--   2. Suppression des policies SELECT redondantes la ou une policy FOR ALL
--      identique (meme USING, meme role) couvre deja le SELECT. Cela divise par
--      deux l'evaluation RLS par ligne sur des tables tres lues, SANS changer les
--      droits (la policy FOR ALL restante a exactement la meme condition de lecture).
--   3. search_path fige sur les fonctions appelees dans le RLS (hygiene).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Index de cles etrangeres ───
create index if not exists idx_brigade_commandes_recette       on brigade_commandes(recette_id);
create index if not exists idx_brigade_commandes_service       on brigade_commandes(service_id);
create index if not exists idx_brigade_taches_assignee         on brigade_taches(assignee_id);
create index if not exists idx_brigade_taches_recette          on brigade_taches(recette_id);
create index if not exists idx_brigade_taches_service          on brigade_taches(service_id);
create index if not exists idx_haccp_controls_template         on haccp_controls(template_id);
create index if not exists idx_pos_connections_created_by      on pos_connections(created_by);
create index if not exists idx_pos_connections_provider        on pos_connections(provider_id);
create index if not exists idx_pos_item_recipe_mapping_matched on pos_item_recipe_mapping(matched_by);
create index if not exists idx_produits_fournisseur            on produits(fournisseur_id);
create index if not exists idx_reservations_created_by         on reservations(created_by);
create index if not exists idx_sop_executions_operateur        on sop_executions(operateur_id);
create index if not exists idx_ventes_historique_recette       on ventes_historique(recette_id);

-- ─── 2. Policies SELECT redondantes (la policy FOR ALL restante couvre le SELECT a l'identique) ───
drop policy if exists cfs_read                     on carte_fiches_salle;
drop policy if exists cp_read                      on carte_plats;
drop policy if exists ci_read                      on commande_items;
drop policy if exists consultants_can_read_compteurs on factures_compteurs;
drop policy if exists kit_items_read               on kit_items;
drop policy if exists pr_read                      on plat_recettes;
drop policy if exists plats_read                   on plats;
drop policy if exists sopex_read                   on sop_executions;
drop policy if exists sopss_read                   on sop_step_states;
drop policy if exists sops_read                    on sops;
drop policy if exists users_can_read_own_settings  on user_settings;

-- ─── 3. search_path fige sur les fonctions RLS-critiques ───
alter function public.user_can_access_etab(text) set search_path = public, pg_temp;
alter function public.current_user_role()        set search_path = public, pg_temp;
