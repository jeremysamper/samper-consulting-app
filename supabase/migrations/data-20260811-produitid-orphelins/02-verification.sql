-- Verification APRES reparation. Lecture seule.
-- Attendu : 27 liens retablis, 28 orphelins restants, et surtout AUCUNE
-- modification d'unite, de prix ou de quantite par rapport a la sauvegarde.

with avant as (
  select b.recette_id, e.ord as ligne,
         e.value->>'produitId' as produit_id,
         e.value->>'unite'     as unite,
         e.value->>'quantite'  as quantite,
         coalesce(e.value->>'prixUnit', e.value->>'prix_unit') as prix
  from backup_recettes_ingredients_20260811 b
  cross join lateral jsonb_array_elements(b.ingredients) with ordinality as e(value, ord)
),
apres as (
  select r.id as recette_id, e.ord as ligne,
         e.value->>'produitId' as produit_id,
         e.value->>'unite'     as unite,
         e.value->>'quantite'  as quantite,
         coalesce(e.value->>'prixUnit', e.value->>'prix_unit') as prix
  from recettes r
  join backup_recettes_ingredients_20260811 b on b.recette_id = r.id
  cross join lateral jsonb_array_elements(r.ingredients) with ordinality as e(value, ord)
)
select 'lignes comparees'                    as controle, count(*)::text as valeur
  from avant a join apres b using (recette_id, ligne)
union all
select 'produitId modifies (attendu 27)', count(*)::text
  from avant a join apres b using (recette_id, ligne)
  where a.produit_id is distinct from b.produit_id
union all
select 'UNITES modifiees (doit etre 0)', count(*)::text
  from avant a join apres b using (recette_id, ligne)
  where a.unite is distinct from b.unite
union all
select 'PRIX modifies (doit etre 0)', count(*)::text
  from avant a join apres b using (recette_id, ligne)
  where a.prix is distinct from b.prix
union all
select 'QUANTITES modifiees (doit etre 0)', count(*)::text
  from avant a join apres b using (recette_id, ligne)
  where a.quantite is distinct from b.quantite
union all
select 'lignes perdues ou ajoutees (doit etre 0)',
  (abs((select count(*) from avant) - (select count(*) from apres)))::text
union all
select 'orphelins restants (attendu 28)', count(*)::text
  from recettes r
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(r.ingredients)='array' then r.ingredients else '[]'::jsonb end
  ) as e(value)
  where nullif(e.value->>'produitId','') is not null
    and not exists (select 1 from produits p where p.id = e.value->>'produitId')
union all
select 'produitId pointant desormais vers un produit reel', count(*)::text
  from recettes r
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(r.ingredients)='array' then r.ingredients else '[]'::jsonb end
  ) as e(value)
  where nullif(e.value->>'produitId','') is not null
    and exists (select 1 from produits p where p.id = e.value->>'produitId');
