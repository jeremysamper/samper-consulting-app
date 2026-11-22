-- -----------------------------------------------------------------------------
-- Retour arrière de 20261122b_lot4a_commande_base.sql
--
-- À lire avant de jouer : ce retour arrière remet le schéma, pas les données
-- écrites entre-temps. Une fois le front du lot 4b en ligne, il efface les
-- commandes, leurs lignes et leur réception, les produits habituels, les
-- règles de correspondance de Ventes POS, le conditionnement numérique des
-- produits et les liens des pertes et de la mise en place. Exporter d'abord
-- ces tables et colonnes en JSON (App-Web/_sauvegardes-supabase/). Les bons de
-- livraison créés par la réception restent dans achats_documents (source
-- « commande »), comme une pièce saisie à la main. Remettre aussi le front
-- d'avant le lot 4b : il lit ces tables sans repli.
--
-- Ordre : ce retour arrière passe AVANT celui du lot 2a
-- (20261122_lot2a_reglages_modules.rollback.sql), qui supprime mep_modeles et
-- commande_cibles, référencées ici.
--
-- Garde : s'il trouve des données du lot 4a, il s'arrête. Après l'export,
-- jouer dans la même transaction, avant lui :
--   select set_config('lot4a.rollback_confirme', 'oui', true);
-- -----------------------------------------------------------------------------

set local lock_timeout = '3s';

do $$
declare
  v_donnees text := '';
  v_n       bigint;
begin
  if coalesce(current_setting('lot4a.rollback_confirme', true), '') = 'oui' then
    return;
  end if;
  if to_regclass('public.commandes') is not null then
    execute 'select count(*) from public.commandes' into v_n;
    if v_n > 0 then v_donnees := v_donnees || ' commandes=' || v_n; end if;
  end if;
  if to_regclass('public.commande_habituels') is not null then
    execute 'select count(*) from public.commande_habituels' into v_n;
    if v_n > 0 then v_donnees := v_donnees || ' commande_habituels=' || v_n; end if;
  end if;
  if to_regclass('public.pos_regles_correspondance') is not null then
    execute 'select count(*) from public.pos_regles_correspondance' into v_n;
    if v_n > 0 then v_donnees := v_donnees || ' pos_regles_correspondance=' || v_n; end if;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'produits' and column_name = 'conditionnement_qte') then
    execute 'select count(*) from public.produits where conditionnement_qte is not null' into v_n;
    if v_n > 0 then v_donnees := v_donnees || ' produits.conditionnement_qte=' || v_n; end if;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'pertes' and column_name = 'produit_id') then
    execute 'select count(*) from public.pertes where produit_id is not null or recette_id is not null or mep_item_id is not null' into v_n;
    if v_n > 0 then v_donnees := v_donnees || ' pertes_liees=' || v_n; end if;
  end if;
  if v_donnees <> '' then
    raise exception 'Données du lot 4a présentes (%). Exporter, puis confirmer par lot4a.rollback_confirme = oui.', btrim(v_donnees);
  end if;
end $$;

-- Realtime
do $$
begin
  if exists (select 1 from pg_publication_tables
             where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'commande_lignes') then
    execute 'alter publication supabase_realtime drop table public.commande_lignes';
  end if;
  if exists (select 1 from pg_publication_tables
             where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'commandes') then
    execute 'alter publication supabase_realtime drop table public.commandes';
  end if;
end $$;

-- 10. Relier les ingrédients
drop function if exists public.recettes_relier_ingredients(text, jsonb);

-- 9. Ventes POS
drop index if exists public.idx_pos_mapping_regle;
alter table public.pos_item_recipe_mapping drop column if exists regle_id;
drop table if exists public.pos_regles_correspondance;

-- 8. Mise en place
drop trigger if exists trg_mep_listes_modele_coherent on public.mep_listes;
drop function if exists public.mep_listes_modele_coherent();
drop index if exists public.idx_mep_listes_modele;
drop index if exists public.idx_mep_listes_etab_date;
alter table public.mep_items
  drop column if exists origine,
  drop column if exists quantite_suggeree;
alter table public.mep_listes
  drop column if exists base_calcul,
  drop column if exists origine,
  drop column if exists modele_id,
  drop column if exists poste;

-- 7. Pertes
drop function if exists public.pertes_frequentes(text, integer, integer);
drop trigger if exists trg_pertes_liens_coherents on public.pertes;
drop function if exists public.pertes_liens_coherents();
drop index if exists public.pertes_mep_item_key;
drop index if exists public.idx_pertes_recette;
drop index if exists public.idx_pertes_produit;
alter table public.pertes
  drop column if exists source,
  drop column if exists mep_item_id,
  drop column if exists recette_id,
  drop column if exists produit_id;

-- 6. à 2. Commande
drop function if exists public.commande_receptionner(uuid, jsonb, text, boolean);
drop table if exists public.commande_groupes;
drop table if exists public.commande_lignes;
drop table if exists public.commandes;
drop table if exists public.commande_habituels;
drop function if exists public.commande_groupes_avant_ecriture();
drop function if exists public.commande_lignes_avant_ecriture();
drop function if exists public.commandes_avant_ecriture();
drop function if exists public.commande_quantite_arrondie(numeric, numeric, numeric, numeric);

-- 1. Conditionnement
alter table public.produits drop column if exists conditionnement_qte;
