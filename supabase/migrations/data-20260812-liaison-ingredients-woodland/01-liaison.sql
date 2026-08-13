-- Liaison en masse des ingrédients au catalogue, Woodland Village (etab-2).
-- APPLIQUÉ EN PRODUCTION LE 12.08.2026. Trace, non rejoué par la CLI.
--
-- Reproduit la PASSE 1 de matchIngredient (src/services/recipeProductMatching.js) :
-- égalité exacte du nom normalisé, confiance 100. Les passes 2 (Levenshtein) et 3
-- (Jaccard) sont volontairement écartées, voir README.md.

-- Normalisation identique à normalizeName() : minuscule, œ/æ déliés, accents retirés,
-- alphanumérique, espaces compactés. Pas d'extension requise.
create or replace function pg_temp.norm(s text) returns text language sql immutable as $$
  select trim(regexp_replace(regexp_replace(
    translate(replace(replace(lower(coalesce(s,'')), 'œ','oe'), 'æ','ae'),
      'àáâãäåçèéêëìíîïñòóôõöùúûüýÿ','aaaaaaceeeeiiiinooooouuuuyy'),
    '[^a-z0-9 ]', ' ', 'g'), '\s+', ' ', 'g'));
$$;

-- Ingrédients non commerciaux isolés, exclus comme dans matchIngredient.
create or replace function pg_temp.non_commercial(n text) returns boolean language sql immutable as $$
  select n in ('sel','poivre','eau','glace','glacon','glacons');
$$;

begin;

create temporary table plan on commit drop as
with cat as (
  select id, nom, pg_temp.norm(nom) as n,
         row_number() over (partition by pg_temp.norm(nom) order by (prix_unitaire is null), id) as rk,
         count(*)     over (partition by pg_temp.norm(nom)) as homonymes
  from produits
  where etablissement_id = 'etab-2' and actif is not false
)
select c.n, c.id as produit_id, c.nom as produit_nom
from cat c
-- homonymes = 1 : un nom de produit présent deux fois au catalogue ne permet pas
-- de choisir sans arbitraire, on ne le rattache pas.
where c.rk = 1 and c.homonymes = 1 and not pg_temp.non_commercial(c.n);

-- Reconstruction du tableau d'ingrédients, ordre garanti par WITH ORDINALITY.
-- Seul produitId est posé : unite et prixUnit restent intacts, le prix réel étant
-- résolu à la lecture et converti par convertPrix().
with cible as (
  select r.id as recette_id,
         jsonb_agg(
           case
             when nullif(e.value->>'produitId','') is null and pl.produit_id is not null
               then e.value || jsonb_build_object('produitId', pl.produit_id)
             else e.value
           end
           order by e.ord
         ) as ingredients,
         count(*) filter (
           where nullif(e.value->>'produitId','') is null and pl.produit_id is not null
         ) as nb_lies
  from recettes r
  cross join lateral jsonb_array_elements(r.ingredients) with ordinality e(value, ord)
  left join plan pl on pl.n = pg_temp.norm(e.value->>'nom')
  where r.etablissement_id = 'etab-2' and jsonb_typeof(r.ingredients) = 'array'
  group by r.id
)
update recettes r
set ingredients = c.ingredients
from cible c
where r.id = c.recette_id and c.nb_lies > 0;

commit;
