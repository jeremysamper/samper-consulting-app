-- Sauvegarde AVANT la suite de la reparation des produitId orphelins.
--
-- Cette fois la table est creee dans un schema DEDIE, hors de `public` :
-- PostgREST n'expose que `public`, donc rien n'atterrit dans l'API. C'est la
-- lecon du 20.09.2026, ou la sauvegarde du 11.08 etait lisible et effacable
-- par n'importe quel compte connecte (cf 20260920_securiser_tables_sauvegarde).
create schema if not exists sauvegardes;
revoke all on schema sauvegardes from anon, authenticated, public;

create table if not exists sauvegardes.recettes_ingredients_20260920 (
  recette_id    text primary key,
  recette_nom   text,
  ingredients   jsonb not null,
  sauvegarde_le timestamptz not null default now()
);
revoke all on table sauvegardes.recettes_ingredients_20260920 from anon, authenticated, public;
alter table sauvegardes.recettes_ingredients_20260920 enable row level security;

-- Snapshot des recettes qui portent encore au moins un produitId orphelin.
insert into sauvegardes.recettes_ingredients_20260920 (recette_id, recette_nom, ingredients)
select distinct r.id, r.nom, r.ingredients
from public.recettes r
where jsonb_typeof(r.ingredients) = 'array'
  and exists (
    select 1
    from jsonb_array_elements(r.ingredients) as e(value)
    where nullif(e.value->>'produitId','') is not null
      and not exists (select 1 from public.produits p where p.id = e.value->>'produitId')
  )
on conflict (recette_id) do nothing;

-- Controle : doit rendre 13 recettes.
select count(*) as recettes_sauvegardees from sauvegardes.recettes_ingredients_20260920;
