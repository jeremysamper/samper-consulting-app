-- Sauvegarde AVANT reparation des produitId orphelins.
-- Table additive, ne touche a rien d'existant : sans risque pour le front
-- deploye (expand/contract). A executer en premier.

create table if not exists backup_recettes_ingredients_20260811 (
  recette_id    text primary key,
  recette_nom   text,
  ingredients   jsonb not null,
  sauvegarde_le timestamptz not null default now()
);

-- Snapshot des recettes qui portent au moins un produitId orphelin.
insert into backup_recettes_ingredients_20260811 (recette_id, recette_nom, ingredients)
select distinct r.id, r.nom, r.ingredients
from recettes r
where jsonb_typeof(r.ingredients) = 'array'
  and exists (
    select 1
    from jsonb_array_elements(r.ingredients) as e(value)
    where nullif(e.value->>'produitId','') is not null
      and not exists (select 1 from produits p where p.id = e.value->>'produitId')
  )
on conflict (recette_id) do nothing;

-- Controle : doit rendre 15 recettes.
select count(*) as recettes_sauvegardees from backup_recettes_ingredients_20260811;
