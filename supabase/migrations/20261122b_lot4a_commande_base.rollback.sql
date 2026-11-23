-- -----------------------------------------------------------------------------
-- Retour arrière de 20261122b_lot4a_commande_base.sql (version réduite du
-- 23.11.2026 : pertes, mise en place, liaison des ingrédients)
--
-- À lire avant de jouer : ce retour arrière remet le schéma, pas les données
-- écrites entre-temps. Une fois le front du lot 4 en ligne, il efface les liens
-- des pertes (produit, recette, ligne de mise en place jetée, source) et ce
-- que la liste de mise en place J+1 garde (poste, modèle, origine, base du
-- calcul, quantité proposée). Exporter d'abord ces colonnes en JSON
-- (App-Web/_sauvegardes-supabase/). Les ingrédients reliés par
-- recettes_relier_ingredients restent reliés : c'est une donnée des fiches.
-- Remettre aussi le front d'avant le lot 4 : il lit ces colonnes sans repli.
--
-- Ordre : ce retour arrière passe le premier, avant ceux des lots 5, 6b,
-- 2a D5 et 2a (20261122_lot2a_reglages_modules.rollback.sql supprime
-- mep_modeles, référencée ici, et refuse de tourner avant lui).
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
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'pertes' and column_name = 'produit_id') then
    execute 'select count(*) from public.pertes where produit_id is not null or recette_id is not null or mep_item_id is not null or source <> ''saisie''' into v_n;
    if v_n > 0 then v_donnees := v_donnees || ' pertes_liees=' || v_n; end if;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'mep_listes' and column_name = 'origine') then
    execute 'select count(*) from public.mep_listes where poste is not null or modele_id is not null or origine <> ''manuel'' or base_calcul is not null' into v_n;
    if v_n > 0 then v_donnees := v_donnees || ' mep_listes=' || v_n; end if;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'mep_items' and column_name = 'origine') then
    execute 'select count(*) from public.mep_items where quantite_suggeree is not null or origine is not null' into v_n;
    if v_n > 0 then v_donnees := v_donnees || ' mep_items=' || v_n; end if;
  end if;
  if v_donnees <> '' then
    raise exception 'Données du lot 4a présentes (%). Exporter, puis confirmer par lot4a.rollback_confirme = oui.', btrim(v_donnees);
  end if;
end $$;

-- 3. Relier les ingrédients
drop function if exists public.recettes_relier_ingredients(text, jsonb);

-- 2. Mise en place
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

-- 1. Pertes
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
