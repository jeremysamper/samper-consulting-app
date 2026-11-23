-- Retour arrière de 20261122_lot2a_reglages_modules.sql.
-- A jouer APRES le retour du front à une version qui ne lit ni n'écrit les
-- réglages du lot 2 (Instant Rollback Vercel) : le front du lot 2b envoie ces
-- colonnes et lit ces tables, et ses écritures échoueraient sans elles.
-- Pertes : les réglages des modules, les modèles de mise en place, le délai
-- de paiement des fournisseurs, les rappels des procédures, les catégories de
-- charges et les jours des créneaux HACCP.
-- Aucune donnée de service (relevés, ventes, commandes) n'est touchée.
--
-- Ordre des retours arrière, à l'inverse de l'application : 4a
-- (20261122b_lot4a_commande_base), puis 5 (20261122_lot5_bureau), puis 6b
-- (20261122_lot6b_reglages_hotel), puis 2a D5, puis ce fichier. Après lui,
-- reglages_modules n'existe plus : les retours arrière de 5 et 6b, qui la
-- modifient, échoueraient. Le bloc suivant s'arrête tant que 4a, 5 ou 6b est
-- encore en place.

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'mep_listes' and column_name = 'modele_id') then
    raise exception 'Jouer d''abord 20261122b_lot4a_commande_base.rollback.sql';
  end if;
  if to_regprocedure('public.reglages_modules_bureau_valide(text,jsonb)') is not null then
    raise exception 'Jouer d''abord 20261122_lot5_bureau.rollback.sql';
  end if;
  if to_regprocedure('public.reglages_modules_hotel_valide(text,jsonb)') is not null then
    raise exception 'Jouer d''abord 20261122_lot6b_reglages_hotel.rollback.sql';
  end if;
end $$;

-- 7. compta_reglages
alter table public.compta_reglages drop column if exists categories_charges;
alter table public.compta_reglages drop column if exists delai_paiement_jours;
drop function if exists public.compta_categories_charges_valides(jsonb);

-- 5. fournisseurs (et garde des colonnes de réglage, partagé avec sops)
drop trigger if exists trg_fournisseurs_reglage_garde on public.fournisseurs;
drop trigger if exists trg_sops_reglage_garde on public.sops;
drop function if exists public.lot2_colonnes_reglage_garde();
alter table public.fournisseurs drop column if exists delai_paiement_jours;

-- 4. sops
alter table public.sops drop constraint if exists sops_rappel_coherent_check;
alter table public.sops drop column if exists rappel_jours;
alter table public.sops drop column if exists rappel_heure;
alter table public.sops drop column if exists rappel_moment;
alter table public.sops drop column if exists rappel_actif;
alter table public.sops drop column if exists roles_designes;

-- 3. mep_modeles
drop table if exists public.mep_modeles;
drop function if exists public.mep_modeles_lignes_valides(jsonb);

-- 2. reglages_modules (la table sort de la publication avec elle)
drop table if exists public.reglages_modules;
drop function if exists public.reglages_modules_avant_ecriture();
drop function if exists public.reglages_modules_config_valide(text, jsonb);
drop function if exists public.reglages_booleen_valide(jsonb);
drop function if exists public.reglages_entier_valide(jsonb, integer, integer);
drop function if exists public.reglages_textes_valides(jsonb, integer, integer, text);

-- 1. HACCP : policies d'avant (toute l'équipe de l'établissement), relues
-- dans pg_policies le 22.11.2026 avant la migration (hz_* et ht_* ne sont
-- versionnées nulle part ailleurs).
alter table public.haccp_creneaux drop column if exists jours;

drop policy if exists hz_insert on public.haccp_zones;
create policy hz_insert on public.haccp_zones for insert to authenticated
  with check (user_can_access_etab(etablissement_id));
drop policy if exists hz_update on public.haccp_zones;
create policy hz_update on public.haccp_zones for update to authenticated
  using (user_can_access_etab(etablissement_id)) with check (user_can_access_etab(etablissement_id));
drop policy if exists hz_delete on public.haccp_zones;
create policy hz_delete on public.haccp_zones for delete to authenticated
  using (user_can_access_etab(etablissement_id));

drop policy if exists hcr_insert on public.haccp_creneaux;
create policy hcr_insert on public.haccp_creneaux for insert to authenticated
  with check (user_can_access_etab(etablissement_id));
drop policy if exists hcr_update on public.haccp_creneaux;
create policy hcr_update on public.haccp_creneaux for update to authenticated
  using (user_can_access_etab(etablissement_id)) with check (user_can_access_etab(etablissement_id));
drop policy if exists hcr_delete on public.haccp_creneaux;
create policy hcr_delete on public.haccp_creneaux for delete to authenticated
  using (user_can_access_etab(etablissement_id));

drop policy if exists ht_insert on public.haccp_ctrl_templates;
create policy ht_insert on public.haccp_ctrl_templates for insert to authenticated
  with check (user_can_access_etab(etablissement_id));
drop policy if exists ht_update on public.haccp_ctrl_templates;
create policy ht_update on public.haccp_ctrl_templates for update to authenticated
  using (user_can_access_etab(etablissement_id)) with check (user_can_access_etab(etablissement_id));
drop policy if exists ht_delete on public.haccp_ctrl_templates;
create policy ht_delete on public.haccp_ctrl_templates for delete to authenticated
  using (user_can_access_etab(etablissement_id));
