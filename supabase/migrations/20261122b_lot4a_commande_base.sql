-- -----------------------------------------------------------------------------
-- Lot 4a « commande et marchandise » : la base (22.11.2026, réduite le
-- 23.11.2026)
--
-- Ajout seul (expand). Le front déployé ne lit rien de neuf, et aucune policy
-- d'une table existante n'est retouchée. Elle passe après la migration du lot
-- 2a (mep_modeles), dont elle vérifie la présence.
--
-- Après la démo du 23.11.2026, Jérémy a retiré la Commande V1 et les règles de
-- Ventes POS : le module Commande reste celui de la production. Restent ici
-- trois blocs :
--
--   1. pertes                         lien au produit, à la recette et à la
--                                     ligne de mise en place jetée ; source
--      pertes_frequentes()            produits les plus déclarés, pour une
--                                     déclaration en deux touches
--   2. mep_listes, mep_items          poste, modèle et origine d'une liste ;
--                                     quantité proposée par l'app (J+1)
--   3. recettes_relier_ingredients()  toutes les lignes d'un même ingrédient
--                                     reliées à un produit en un geste
--
-- Droits : RLS de pertes, mep_*, recettes et produits inchangée. Les fonctions
-- sont SECURITY INVOKER : elles passent par la RLS de qui les appelle. Les
-- déclencheurs de cohérence refusent un lien vers une ligne d'une autre maison.
--
-- Idempotente : chaque objet est créé « si absent » ou remplacé à l'identique.
-- Aucun remplissage de données. Retour arrière :
-- 20261122b_lot4a_commande_base.rollback.sql.
-- -----------------------------------------------------------------------------

-- Les alter table prennent un verrou exclusif sur des tables lues en service :
-- ne pas attendre plus de 3 s derrière une transaction longue (la migration
-- échoue alors, sans rien changer, et se rejoue plus tard).
set local lock_timeout = '3s';

do $$
begin
  if to_regclass('public.mep_modeles') is null then
    raise exception 'Appliquer d''abord 20261122_lot2a_reglages_modules.sql';
  end if;
end $$;


-- =============================================================================
-- 1. pertes : liens et produits fréquents
-- =============================================================================

alter table public.pertes
  add column if not exists produit_id  text references public.produits(id) on delete set null,
  add column if not exists recette_id  text references public.recettes(id) on delete set null,
  add column if not exists mep_item_id uuid references public.mep_items(id) on delete set null,
  add column if not exists source      text not null default 'saisie'
    constraint pertes_source_check check (source in ('saisie', 'frequent', 'mep'));

comment on column public.pertes.produit_id is 'Produit du catalogue perdu (lot 4a). Le texte produit reste le libellé affiché.';
comment on column public.pertes.recette_id is 'Préparation perdue (lot 4a), par exemple une ligne de mise en place jetée.';
comment on column public.pertes.mep_item_id is 'Ligne de mise en place déclarée « jetée » (lot 4a). Une seule perte par ligne.';
comment on column public.pertes.source is 'saisie (formulaire), frequent (produit fréquent, deux touches), mep (jeté depuis la mise en place).';

create index if not exists idx_pertes_produit on public.pertes (produit_id) where produit_id is not null;
create index if not exists idx_pertes_recette on public.pertes (recette_id) where recette_id is not null;
create unique index if not exists pertes_mep_item_key on public.pertes (mep_item_id) where mep_item_id is not null;

-- Produit, recette et ligne de mise en place de la même maison que la perte.
-- INVOKER : une ligne que l'appelant ne voit pas est refusée comme absente.
create or replace function public.pertes_liens_coherents()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $fn$
begin
  if new.produit_id is not null
     and (tg_op = 'INSERT' or new.produit_id is distinct from old.produit_id or new.etablissement_id is distinct from old.etablissement_id)
     and not exists (select 1 from public.produits p
                     where p.id = new.produit_id and p.etablissement_id = new.etablissement_id) then
    raise exception 'Ce produit n''est pas dans le catalogue de l''établissement.' using errcode = '23514';
  end if;
  if new.recette_id is not null
     and (tg_op = 'INSERT' or new.recette_id is distinct from old.recette_id or new.etablissement_id is distinct from old.etablissement_id)
     and not exists (select 1 from public.recettes r
                     where r.id = new.recette_id and r.etablissement_id = new.etablissement_id) then
    raise exception 'Cette recette n''est pas dans l''établissement.' using errcode = '23514';
  end if;
  if new.mep_item_id is not null
     and (tg_op = 'INSERT' or new.mep_item_id is distinct from old.mep_item_id or new.etablissement_id is distinct from old.etablissement_id)
     and not exists (select 1 from public.mep_items i
                     join public.mep_listes l on l.id = i.liste_id
                     where i.id = new.mep_item_id and l.etablissement_id = new.etablissement_id) then
    raise exception 'Cette ligne de mise en place n''est pas dans l''établissement.' using errcode = '23514';
  end if;
  return new;
end;
$fn$;

revoke all on function public.pertes_liens_coherents() from public, anon, authenticated;

create or replace trigger trg_pertes_liens_coherents
  before insert or update of produit_id, recette_id, mep_item_id, etablissement_id on public.pertes
  for each row execute function public.pertes_liens_coherents();

-- Produits les plus déclarés sur p_jours (60 par défaut), avec la dernière
-- déclaration de chacun (quantité, unité, motif, valeur) pour la proposer
-- telle quelle : une touche sur le produit, une touche pour valider. Une ligne
-- par produit du catalogue, sinon par recette, sinon par libellé.
-- INVOKER : seules les pertes que l'appelant voit comptent.
create or replace function public.pertes_frequentes(
  p_etablissement_id text,
  p_jours            integer default 60,
  p_limite           integer default 12)
returns table (
  cle         text,
  produit_id  text,
  recette_id  text,
  produit     text,
  categorie   text,
  unite       text,
  quantite    numeric,
  valeur_unit numeric,
  motif       text,
  nb          integer,
  derniere    date)
language sql
stable
security invoker
set search_path = pg_catalog, public
as $fn$
  with recentes as (
    select pe.*,
           coalesce('p:' || pe.produit_id, 'r:' || pe.recette_id, 'n:' || lower(btrim(pe.produit))) as cle_perte
      from public.pertes pe
     where pe.etablissement_id = p_etablissement_id
       and pe.date >= (now() at time zone 'Europe/Zurich')::date - greatest(least(coalesce(p_jours, 60), 365), 1)
       and coalesce(btrim(pe.produit), '') <> ''
  ),
  derniere as (
    select distinct on (r.cle_perte) r.*
      from recentes r
     order by r.cle_perte, r.date desc, r.created_at desc nulls last
  ),
  comptes as (
    select r.cle_perte, count(*)::integer as nb from recentes r group by r.cle_perte
  )
  select d.cle_perte, d.produit_id, d.recette_id, d.produit, d.categorie, d.unite,
         d.quantite, d.valeur_unit, d.motif, c.nb, d.date
    from derniere d
    join comptes c on c.cle_perte = d.cle_perte
   order by c.nb desc, d.date desc, d.produit
   limit greatest(least(coalesce(p_limite, 12), 50), 1)
$fn$;

revoke all on function public.pertes_frequentes(text, integer, integer) from public, anon, authenticated;
grant execute on function public.pertes_frequentes(text, integer, integer) to authenticated;


-- =============================================================================
-- 2. Mise en place : poste, modèle, liste J+1
-- =============================================================================

alter table public.mep_listes
  add column if not exists poste       text
    constraint mep_listes_poste_check check (poste is null or (btrim(poste) <> '' and length(poste) <= 60)),
  add column if not exists modele_id   uuid references public.mep_modeles(id) on delete set null,
  add column if not exists origine     text not null default 'manuel'
    constraint mep_listes_origine_check check (origine in ('manuel', 'modele', 'prevision')),
  add column if not exists base_calcul jsonb
    constraint mep_listes_base_calcul_check check (base_calcul is null or jsonb_typeof(base_calcul) = 'object');

comment on column public.mep_listes.poste is 'Poste de la liste (réglage mep.postes, lot 2). Null = toute la cuisine.';
comment on column public.mep_listes.modele_id is 'Modèle d''où la liste est partie (mep_modeles).';
comment on column public.mep_listes.origine is 'manuel, modele, ou prevision (liste J+1 pré-remplie par les ventes et la prévision des couverts).';
comment on column public.mep_listes.base_calcul is 'Ce qui a servi au calcul J+1, pour l''afficher : { jours_ventes, jour_semaine, couverts_prevus, couverts_reference }.';

create index if not exists idx_mep_listes_etab_date on public.mep_listes (etablissement_id, date_service);
create index if not exists idx_mep_listes_modele on public.mep_listes (modele_id) where modele_id is not null;

alter table public.mep_items
  add column if not exists quantite_suggeree numeric
    constraint mep_items_quantite_suggeree_check check (quantite_suggeree is null or (quantite_suggeree >= 0 and quantite_suggeree < 1000000)),
  add column if not exists origine text
    constraint mep_items_origine_check check (origine is null or origine in ('manuel', 'modele', 'ventes', 'prevision'));

comment on column public.mep_items.quantite_suggeree is 'Quantité proposée par l''app (ventes et prévision), gardée à côté de la quantité retenue.';
comment on column public.mep_items.origine is 'D''où vient la ligne : manuel, modele, ventes ou prevision.';

-- Le modèle d'une liste est de la même maison. INVOKER : un modèle que
-- l'appelant ne voit pas est refusé comme absent.
create or replace function public.mep_listes_modele_coherent()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $fn$
begin
  if new.modele_id is not null
     and (tg_op = 'INSERT' or new.modele_id is distinct from old.modele_id or new.etablissement_id is distinct from old.etablissement_id)
     and not exists (select 1 from public.mep_modeles m
                     where m.id = new.modele_id and m.etablissement_id = new.etablissement_id) then
    raise exception 'Ce modèle de mise en place n''est pas dans l''établissement.' using errcode = '23514';
  end if;
  return new;
end;
$fn$;

revoke all on function public.mep_listes_modele_coherent() from public, anon, authenticated;

create or replace trigger trg_mep_listes_modele_coherent
  before insert or update of modele_id, etablissement_id on public.mep_listes
  for each row execute function public.mep_listes_modele_coherent();


-- =============================================================================
-- 3. recettes_relier_ingredients
-- =============================================================================

-- Relie au produit p_produit_id toutes les lignes d'ingrédient données, en une
-- transaction, sans réécrire le reste des fiches (une modification faite en
-- même temps sur une autre ligne de la fiche est gardée).
--   p_liens : [{ recette_id, ingredient_id, prix_unit, unite }] ; prix_unit et
--   unite sont ceux que l'app calcule (applyProductToIngredient), facultatifs.
-- Chaque ligne reliée prend produitId (et prixUnit, unite s'ils sont donnés) et
-- perd needsReview et matchSuggestions, comme dans l'éditeur.
-- Seules les fiches de la maison du produit sont touchées.
-- Rend { relies, attendus } : relies < attendus quand une ligne a disparu
-- entre-temps, relies > attendus quand une fiche porte deux lignes de même id.
-- INVOKER : la RLS de l'appelant s'applique aux produits et aux fiches.
create or replace function public.recettes_relier_ingredients(
  p_produit_id text,
  p_liens      jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $fn$
declare
  v_etab     text;
  v_relies   integer := 0;
  v_attendus integer;
  v_n        integer;
  r          record;
begin
  if jsonb_typeof(p_liens) is distinct from 'array' or jsonb_array_length(p_liens) > 5000 then
    raise exception 'Liens invalides.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_liens) e
             where jsonb_typeof(e) <> 'object'
                or coalesce(e->>'recette_id', '') = ''
                or coalesce(e->>'ingredient_id', '') = ''
                or (e ? 'prix_unit' and jsonb_typeof(e->'prix_unit') not in ('number', 'null'))
                or (e ? 'unite' and jsonb_typeof(e->'unite') not in ('string', 'null'))) then
    raise exception 'Chaque lien donne recette_id et ingredient_id ; prix_unit est un nombre, unite un texte.' using errcode = '22023';
  end if;

  select p.etablissement_id into v_etab from public.produits p where p.id = p_produit_id;
  if not found then
    raise exception 'Produit introuvable.' using errcode = 'P0002';
  end if;

  select count(distinct (e->>'recette_id', e->>'ingredient_id')) into v_attendus
    from jsonb_array_elements(p_liens) e;

  for r in
    select e->>'recette_id' as recette_id,
           jsonb_object_agg(e->>'ingredient_id', e) as liens
      from jsonb_array_elements(p_liens) e
     group by e->>'recette_id'
  loop
    with cible as (
      select rc.id, rc.ingredients
        from public.recettes rc
       where rc.id = r.recette_id
         and rc.etablissement_id = v_etab
         and jsonb_typeof(rc.ingredients) = 'array'
       for update
    ),
    nouveau as (
      select c.id,
             count(*) filter (where jsonb_typeof(t.e) = 'object' and r.liens ? (t.e->>'id')) as n,
             jsonb_agg(
               case when jsonb_typeof(t.e) = 'object' and r.liens ? (t.e->>'id') then
                 (t.e - 'needsReview' - 'matchSuggestions')
                   || jsonb_build_object('produitId', p_produit_id)
                   || case when jsonb_typeof(r.liens->(t.e->>'id')->'prix_unit') = 'number'
                           then jsonb_build_object('prixUnit', r.liens->(t.e->>'id')->'prix_unit') else '{}'::jsonb end
                   || case when jsonb_typeof(r.liens->(t.e->>'id')->'unite') = 'string'
                           then jsonb_build_object('unite', r.liens->(t.e->>'id')->'unite') else '{}'::jsonb end
               else t.e end
               order by t.ord) as ingredients
        from cible c
        cross join lateral jsonb_array_elements(c.ingredients) with ordinality as t(e, ord)
       group by c.id
    )
    update public.recettes rc
       set ingredients = nv.ingredients
      from nouveau nv
     where rc.id = nv.id
       and nv.n > 0
    returning nv.n into v_n;
    v_relies := v_relies + coalesce(v_n, 0);
    v_n := null;
  end loop;

  return jsonb_build_object('relies', v_relies, 'attendus', v_attendus);
end;
$fn$;

revoke all on function public.recettes_relier_ingredients(text, jsonb) from public, anon, authenticated;
grant execute on function public.recettes_relier_ingredients(text, jsonb) to authenticated;
