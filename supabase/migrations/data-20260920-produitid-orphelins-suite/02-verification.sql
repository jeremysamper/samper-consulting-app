-- Verification ligne a ligne, a lire AVANT de remplacer le rollback par un
-- commit dans 01-reparer-liens.sql. Tout doit etre conforme a la colonne
-- « attendu ».

-- 1) Comparaison avant / apres : seul produitId a le droit d'avoir bouge.
with avant as (
  select b.recette_id, e.ord as ligne,
         e.value->>'nom' as nom, e.value->>'unite' as unite,
         e.value->>'quantite' as quantite, e.value->>'prixUnit' as prix,
         e.value->>'produitId' as produit
    from sauvegardes.recettes_ingredients_20260920 b
    cross join lateral jsonb_array_elements(b.ingredients) with ordinality as e(value, ord)
),
apres as (
  select r.id as recette_id, e.ord as ligne,
         e.value->>'nom' as nom, e.value->>'unite' as unite,
         e.value->>'quantite' as quantite, e.value->>'prixUnit' as prix,
         e.value->>'produitId' as produit
    from public.recettes r
    join sauvegardes.recettes_ingredients_20260920 b on b.recette_id = r.id
    cross join lateral jsonb_array_elements(r.ingredients) with ordinality as e(value, ord)
)
select 'lignes comparees'        as controle, count(*)::text as valeur, '77' as attendu from avant
union all
select 'produitId repares',
       count(*) filter (where av.produit is distinct from ap.produit)::text, '17'
  from avant av join apres ap using (recette_id, ligne)
union all
select 'unites modifiees',
       count(*) filter (where av.unite is distinct from ap.unite)::text, '0'
  from avant av join apres ap using (recette_id, ligne)
union all
select 'prix modifies',
       count(*) filter (where av.prix is distinct from ap.prix)::text, '0'
  from avant av join apres ap using (recette_id, ligne)
union all
select 'quantites modifiees',
       count(*) filter (where av.quantite is distinct from ap.quantite)::text, '0'
  from avant av join apres ap using (recette_id, ligne)
union all
select 'noms modifies',
       count(*) filter (where av.nom is distinct from ap.nom)::text, '0'
  from avant av join apres ap using (recette_id, ligne)
union all
select 'lignes perdues ou ajoutees',
       ((select count(*) from avant) - (select count(*) from apres))::text, '0'
union all
-- 2) Etat global des liens apres reparation.
select 'orphelins restants (etab-2)',
       count(*)::text, '11 (les cas a arbitrer, voir README)'
  from public.recettes r
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(r.ingredients)='array' then r.ingredients else '[]'::jsonb end
  ) as e(value)
 where r.etablissement_id = 'etab-2'
   and nullif(e.value->>'produitId','') is not null
   and not exists (select 1 from public.produits p where p.id = e.value->>'produitId')
union all
-- 3) Les 17 lignes reparees doivent pointer sur un produit de meme prix.
select 'liens repares dont le prix diverge du catalogue',
       count(*)::text, '0'
  from public.recettes r
  join sauvegardes.recettes_ingredients_20260920 b on b.recette_id = r.id
  cross join lateral jsonb_array_elements(r.ingredients) as e(value)
  join public.produits p on p.id = e.value->>'produitId'
 where p.id in ('prod-1779237210905552','prod-1779237212609767','prod-1779237210678563',
                'prod-1779237210678923','prod-1779237211029410','prod-1779237210735410',
                'prod-1779237210307756','prod-1779237212207405')
   and abs(coalesce(p.prix_unitaire,0) - (e.value->>'prixUnit')::numeric)
       > greatest(abs((e.value->>'prixUnit')::numeric) * 0.01, 1e-9);
