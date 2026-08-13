-- Sauvegarde AVANT la liaison en masse. À exécuter en premier.
-- Contient l'état complet des ingrédients des recettes de etab-2.

create table if not exists public.bak_20260812_liaison_ingredients (
  recette_id       text primary key,
  etablissement_id text,
  nom              text,
  ingredients      jsonb,
  sauvegarde_le    timestamptz not null default now()
);

insert into public.bak_20260812_liaison_ingredients (recette_id, etablissement_id, nom, ingredients)
select r.id, r.etablissement_id, r.nom, r.ingredients
from recettes r
where r.etablissement_id = 'etab-2' and jsonb_typeof(r.ingredients) = 'array'
on conflict (recette_id) do nothing;

-- Table de service : aucun rôle applicatif n'a besoin de la lire.
revoke all on public.bak_20260812_liaison_ingredients from anon, authenticated;

-- Attendu au 12.08.2026 : 185 recettes, 1151 ingrédients.
select count(*) as recettes, sum(jsonb_array_length(ingredients)) as ingredients
from public.bak_20260812_liaison_ingredients;
