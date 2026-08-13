-- Contrôles d'intégrité passés après l'application du 12.08.2026.
-- Valeurs constatées ce jour-là en commentaire.

-- 1. Progression des liens, et aucune perte d'ingrédient.
with avant as (
  select count(*) filter (where nullif(i.value->>'produitId','') is not null) as lies, count(*) as total
  from public.bak_20260812_liaison_ingredients b, lateral jsonb_array_elements(b.ingredients) i
),
apres as (
  select count(*) filter (where nullif(i.value->>'produitId','') is not null) as lies, count(*) as total
  from recettes r, lateral jsonb_array_elements(r.ingredients) i
  where r.etablissement_id = 'etab-2' and jsonb_typeof(r.ingredients) = 'array'
)
select avant.lies as lies_avant,          -- 79
       apres.lies as lies_apres,          -- 138
       apres.lies - avant.lies as gagnes, -- 59
       apres.total = avant.total as aucun_ingredient_perdu  -- true
from avant, apres;

-- 2. Noms, quantités et unités strictement inchangés.
select
  (select count(*) from public.bak_20260812_liaison_ingredients b join recettes r on r.id = b.recette_id
   where (select jsonb_agg(x.value->>'nom' order by x.ord) from jsonb_array_elements(b.ingredients) with ordinality x(value,ord))
      is distinct from
         (select jsonb_agg(y.value->>'nom' order by y.ord) from jsonb_array_elements(r.ingredients) with ordinality y(value,ord))
  ) as noms_modifies,          -- 0
  (select count(*) from public.bak_20260812_liaison_ingredients b join recettes r on r.id = b.recette_id
   where (select jsonb_agg(x.value->>'quantite' order by x.ord) from jsonb_array_elements(b.ingredients) with ordinality x(value,ord))
      is distinct from
         (select jsonb_agg(y.value->>'quantite' order by y.ord) from jsonb_array_elements(r.ingredients) with ordinality y(value,ord))
  ) as quantites_modifiees,    -- 0
  (select count(*) from public.bak_20260812_liaison_ingredients b join recettes r on r.id = b.recette_id
   where (select jsonb_agg(x.value->>'unite' order by x.ord) from jsonb_array_elements(b.ingredients) with ordinality x(value,ord))
      is distinct from
         (select jsonb_agg(y.value->>'unite' order by y.ord) from jsonb_array_elements(r.ingredients) with ordinality y(value,ord))
  ) as unites_modifiees;       -- 0

-- 3. Aucun lien orphelin créé (produitId pointant vers un produit inexistant).
--    Constaté : 28 orphelins au total, les 28 préexistants, 0 créés ici.
with liens as (
  select r.id as recette_id, r.etablissement_id, i.value->>'produitId' as pid
  from recettes r, lateral jsonb_array_elements(r.ingredients) i
  where jsonb_typeof(r.ingredients) = 'array' and nullif(i.value->>'produitId','') is not null
),
avant as (
  select b.recette_id, i.value->>'produitId' as pid
  from public.bak_20260812_liaison_ingredients b, lateral jsonb_array_elements(b.ingredients) i
  where nullif(i.value->>'produitId','') is not null
),
orphelins as (
  select l.* from liens l
  where not exists (select 1 from produits p where p.id = l.pid and p.etablissement_id = l.etablissement_id)
)
select count(*) as orphelins_total,                                                     -- 28
       count(*) filter (where exists (select 1 from avant a where a.recette_id = o.recette_id and a.pid = o.pid)) as preexistants,  -- 28
       count(*) filter (where not exists (select 1 from avant a where a.recette_id = o.recette_id and a.pid = o.pid)) as crees_ici  -- 0
from orphelins o;
