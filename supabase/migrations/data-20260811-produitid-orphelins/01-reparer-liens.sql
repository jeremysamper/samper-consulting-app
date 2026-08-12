-- ═══════════════════════════════════════════════════════════════════════════
-- Reparation des produitId orphelins dans recettes.ingredients
--
-- Contexte : le catalogue a ete re-importe le 20.05.2026 (suppression puis
-- recreation des produits avec de nouveaux ids). Les recettes ont garde les
-- anciens ids du 27.04.2026, soit 55 lignes pointant dans le vide sur 15
-- recettes actives. Ces lignes gardent leur prix propre, donc le food cost se
-- calcule encore, mais elles ne suivent plus aucune mise a jour du catalogue.
--
-- Regle d'appariement : nom + unite (l'identite du produit ; le prix a pu
-- bouger entre deux imports). Le prix ne sert qu'a departager les homonymes.
-- Un match doit etre UNIQUE, sinon la ligne est laissee en l'etat.
--
-- Ce script ne modifie QUE la cle produitId. Ni `unite`, ni `prixUnit`, ni
-- `quantite` ne sont touches : aucune valeur affichee ne change, seul le lien
-- est retabli. Le re-chiffrage eventuel reste une decision humaine.
--
-- A executer dans l'ordre : 00-sauvegarde.sql, puis ce fichier, puis
-- 02-verification.sql. En cas de doute : 99-rollback.sql.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

with orphelins as (
  select
    r.id                                                  as recette_id,
    r.etablissement_id,
    e.ord                                                 as ligne,
    e.value->>'nom'                                       as ing_nom,
    nullif(e.value->>'unite','')                          as ing_unite,
    case
      when coalesce(e.value->>'prixUnit', e.value->>'prix_unit') ~ '^-?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?$'
      then coalesce(e.value->>'prixUnit', e.value->>'prix_unit')::numeric
    end                                                   as prix_ing
  from recettes r
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(r.ingredients)='array' then r.ingredients else '[]'::jsonb end
  ) with ordinality as e(value, ord)
  where nullif(e.value->>'produitId','') is not null
    and not exists (
      select 1 from produits p where p.id = e.value->>'produitId'
    )
),
resolution as (
  select
    o.recette_id,
    o.ligne,
    -- Match unique sur nom + unite, sinon homonymes departages par le prix.
    coalesce(nu.id, nup.id) as new_id
  from orphelins o
  -- `having count(*) = 1` sans group by : un seul groupe agrege sur tous les
  -- candidats, la ligne n'est donc rendue que s'il y en a exactement un.
  -- min(p.id) designe alors ce candidat unique. Tout appariement ambigu est
  -- refuse plutot que tranche au hasard.
  left join lateral (
    select min(p.id) as id
    from produits p
    where p.etablissement_id = o.etablissement_id
      and lower(btrim(p.nom)) = lower(btrim(o.ing_nom))
      and p.unite_ref = o.ing_unite
    having count(*) = 1
  ) nu on true
  left join lateral (
    select min(p.id) as id
    from produits p
    where p.etablissement_id = o.etablissement_id
      and lower(btrim(p.nom)) = lower(btrim(o.ing_nom))
      and p.unite_ref = o.ing_unite
      and o.prix_ing is not null
      and abs(coalesce(p.prix_unitaire,0) - o.prix_ing) <= greatest(abs(o.prix_ing)*0.01, 1e-9)
    having count(*) = 1
  ) nup on true
),
a_reparer as (
  select * from resolution where new_id is not null
)
update recettes r
set ingredients = (
  select jsonb_agg(
           case
             when c.new_id is not null
               then jsonb_set(e.value, '{produitId}', to_jsonb(c.new_id))
             else e.value
           end
           order by e.ord
         )
  from jsonb_array_elements(r.ingredients) with ordinality as e(value, ord)
  left join a_reparer c on c.recette_id = r.id and c.ligne = e.ord
)
where r.id in (select recette_id from a_reparer)
  and jsonb_typeof(r.ingredients) = 'array';

-- Relire 02-verification.sql AVANT de valider.
-- commit;
rollback;
