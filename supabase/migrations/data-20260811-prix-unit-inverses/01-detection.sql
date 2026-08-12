-- ═══════════════════════════════════════════════════════════════════════════
-- Detection des prixUnit ecrits a l'envers par la conversion d'unite inversee
-- (correctif code du 11.08.2026 : adjustPrixUnitForUnit + 4 sites appelants).
--
-- LECTURE SEULE : trois SELECT independants, aucun DDL, aucune ecriture.
-- Chaque requete se colle telle quelle dans le SQL editor Supabase.
--
-- Rappel du bug : le prix par unite est une grandeur INVERSE de la quantite.
--   convertFactor('kg','g') = 1000  ->  quantite x 1000, prix / 1000
-- Le code ecrivait `prix * facteur` au lieu de `prix / facteur`, soit un ecart
-- d'un facteur facteur^2 (10^6 entre g et kg).
--
-- Les ingredients sont stockes en JSONB dans recettes.ingredients :
--   [{ nom, quantite, unite, prixUnit, produitId, categorie }, ...]
-- Les lignes anciennes peuvent porter `prix_unit` au lieu de `prixUnit`
-- (cf. mapRecetteFromDB), les deux sont couvertes.
--
-- Les CTE unite_taille / ingredients / prix_catalogue sont repetees dans les
-- trois requetes a dessein : chacune reste autonome et copiable seule.
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- REQUETE A : detection deterministe (lien catalogue + unite differente)
--
-- Signature recherchee : le prix stocke colle a la formule inversee
-- (prix_catalogue x facteur) et PAS a la formule correcte (prix / facteur).
-- Tolerance 2 % en relatif, plancher 1e-6 absolu pour absorber l'arrondi
-- applique a l'ecriture (Math.round(x * 1e6) / 1e6).
-- ═══════════════════════════════════════════════════════════════════════════

with unite_taille(u, famille, taille) as (
  -- Copie EXACTE des tables de convertFactor(). La casse est volontairement
  -- respectee : cote JS `volumes` contient 'L' et non 'l', donc une ligne
  -- saisie en 'l' minuscule n'a jamais ete convertie et ne doit pas sortir ici.
  values ('g',  'masse',  1::numeric),
         ('kg', 'masse',  1000),
         ('ml', 'volume', 1),
         ('cl', 'volume', 10),
         ('L',  'volume', 1000)
),
brut as (
  select
    r.id                                                  as recette_id,
    r.nom                                                 as recette_nom,
    r.etablissement_id,
    r.statut,
    e.ord                                                 as ligne,
    e.value->>'nom'                                       as ing_nom,
    nullif(e.value->>'produitId', '')                     as produit_id,
    nullif(e.value->>'unite', '')                         as ing_unite,
    coalesce(e.value->>'prixUnit', e.value->>'prix_unit') as prix_txt,
    e.value->>'quantite'                                  as qte_txt
  from recettes r
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(r.ingredients) = 'array' then r.ingredients else '[]'::jsonb end
  ) with ordinality as e(value, ord)
),
ingredients as (
  -- Cast numerique defensif : `->>` rend du texte, une valeur vide ou non
  -- numerique ferait echouer tout le lot.
  select brut.*,
    case when prix_txt ~ '^-?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?$' then prix_txt::numeric end as prix_stocke,
    case when qte_txt  ~ '^-?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?$' then qte_txt::numeric  end as quantite
  from brut
),
prix_catalogue as (
  -- Prix effectif resolu comme mapProduitFromDB : fournisseur principal,
  -- sinon produits.prix_unitaire.
  select p.id, p.nom, p.unite_ref,
         coalesce(princ.prix_unitaire, p.prix_unitaire, 0)::numeric as prix_ref
  from produits p
  left join lateral (
    select x.prix_unitaire
    from produit_fournisseurs x
    where x.produit_id = p.id
    order by x.est_principal desc nulls last, x.id
    limit 1
  ) princ on true
)
select
  i.etablissement_id,
  i.recette_nom,
  i.statut,
  i.ligne,
  i.ing_nom,
  c.nom                                           as produit_catalogue,
  c.unite_ref                                     as unite_catalogue,
  i.ing_unite                                     as unite_ingredient,
  c.prix_ref                                      as prix_catalogue,
  i.prix_stocke,
  round(c.prix_ref / f.facteur, 6)                as prix_attendu,
  -- Vaut facteur^2 : 1000000 dans le sens kg -> g, 0.000001 dans l'autre.
  round(i.prix_stocke / nullif(c.prix_ref / f.facteur, 0), 6) as facteur_erreur,
  i.quantite,
  round(i.quantite * i.prix_stocke, 2)            as cout_ligne_actuel,
  round(i.quantite * (c.prix_ref / f.facteur), 2) as cout_ligne_corrige,
  i.recette_id
from ingredients i
join prix_catalogue c on c.id = i.produit_id
join unite_taille tc on tc.u = c.unite_ref
join unite_taille ti on ti.u = i.ing_unite
cross join lateral (select tc.taille / ti.taille as facteur) f
where i.prix_stocke is not null
  and c.prix_ref > 0
  and tc.famille = ti.famille   -- convertFactor aurait rendu non-null
  and tc.u <> ti.u              -- ... et un facteur different de 1
  and abs(i.prix_stocke - c.prix_ref * f.facteur)
        <= greatest(abs(c.prix_ref * f.facteur) * 0.02, 0.000001)
  and abs(i.prix_stocke - c.prix_ref / f.facteur)
        >  greatest(abs(c.prix_ref / f.facteur) * 0.02, 0.000001)
order by abs(coalesce(i.quantite, 0) * (i.prix_stocke - c.prix_ref / f.facteur)) desc;


-- ═══════════════════════════════════════════════════════════════════════════
-- REQUETE B : balayage heuristique (changement d'unite dans le select)
--
-- Ce chemin-la inversait quantite ET prix ensemble : le cout de la ligne
-- restait juste, donc la requete A ne le voit pas et le catalogue ne peut pas
-- l'arbitrer. On cherche donc des couples quantite/prix invraisemblables.
-- Seuils repris de detectAberrantPrice (src/modules/catalogue/Catalogue.jsx:64)
-- pour g/ml, transposes x1000 pour kg/L.
-- ═══════════════════════════════════════════════════════════════════════════

with brut as (
  select
    r.id                                                  as recette_id,
    r.nom                                                 as recette_nom,
    r.etablissement_id,
    r.statut,
    e.ord                                                 as ligne,
    e.value->>'nom'                                       as ing_nom,
    nullif(e.value->>'unite', '')                         as ing_unite,
    coalesce(e.value->>'prixUnit', e.value->>'prix_unit') as prix_txt,
    e.value->>'quantite'                                  as qte_txt
  from recettes r
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(r.ingredients) = 'array' then r.ingredients else '[]'::jsonb end
  ) with ordinality as e(value, ord)
),
ingredients as (
  select brut.*,
    case when prix_txt ~ '^-?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?$' then prix_txt::numeric end as prix_stocke,
    case when qte_txt  ~ '^-?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?$' then qte_txt::numeric  end as quantite
  from brut
)
select
  i.etablissement_id,
  i.recette_nom,
  i.statut,
  i.ligne,
  i.ing_nom,
  i.ing_unite,
  i.quantite,
  i.prix_stocke,
  round(coalesce(i.quantite, 0) * i.prix_stocke, 2) as cout_ligne,
  case
    when i.ing_unite in ('g', 'ml') and i.prix_stocke > 10      then 'prix tres eleve pour du ' || i.ing_unite
    when i.ing_unite in ('g', 'ml') and i.prix_stocke < 0.00001 then 'prix tres bas pour du ' || i.ing_unite
    when i.ing_unite in ('kg', 'L') and i.prix_stocke > 10000   then 'prix tres eleve pour du ' || i.ing_unite
    when i.ing_unite in ('kg', 'L') and i.prix_stocke < 0.01    then 'prix tres bas pour du ' || i.ing_unite
    when i.ing_unite in ('kg', 'L') and i.quantite > 1000       then 'quantite invraisemblable (> 1 tonne)'
    else 'quantite invraisemblable (< 0.01)'
  end as motif,
  i.recette_id
from ingredients i
where i.prix_stocke is not null
  and i.prix_stocke > 0
  and (
       (i.ing_unite in ('g', 'ml') and (i.prix_stocke > 10    or i.prix_stocke < 0.00001))
    or (i.ing_unite in ('kg', 'L') and (i.prix_stocke > 10000 or i.prix_stocke < 0.01))
    or (i.ing_unite in ('kg', 'L') and i.quantite > 1000)
    or (i.ing_unite in ('g', 'ml') and i.quantite < 0.01 and i.quantite > 0)
  )
order by i.etablissement_id, i.recette_nom, i.ligne;


-- ═══════════════════════════════════════════════════════════════════════════
-- REQUETE C : comptage, pour mesurer l'ampleur avant de decider d'une reprise.
-- Meme filtre que la requete A, agrege par etablissement.
-- ═══════════════════════════════════════════════════════════════════════════

with unite_taille(u, famille, taille) as (
  values ('g',  'masse',  1::numeric),
         ('kg', 'masse',  1000),
         ('ml', 'volume', 1),
         ('cl', 'volume', 10),
         ('L',  'volume', 1000)
),
brut as (
  select
    r.id                                                  as recette_id,
    r.etablissement_id,
    nullif(e.value->>'produitId', '')                     as produit_id,
    nullif(e.value->>'unite', '')                         as ing_unite,
    coalesce(e.value->>'prixUnit', e.value->>'prix_unit') as prix_txt,
    e.value->>'quantite'                                  as qte_txt
  from recettes r
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(r.ingredients) = 'array' then r.ingredients else '[]'::jsonb end
  ) with ordinality as e(value, ord)
),
ingredients as (
  select brut.*,
    case when prix_txt ~ '^-?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?$' then prix_txt::numeric end as prix_stocke,
    case when qte_txt  ~ '^-?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?$' then qte_txt::numeric  end as quantite
  from brut
),
prix_catalogue as (
  select p.id, p.unite_ref,
         coalesce(princ.prix_unitaire, p.prix_unitaire, 0)::numeric as prix_ref
  from produits p
  left join lateral (
    select x.prix_unitaire
    from produit_fournisseurs x
    where x.produit_id = p.id
    order by x.est_principal desc nulls last, x.id
    limit 1
  ) princ on true
)
select
  i.etablissement_id,
  count(*)                                            as lignes_touchees,
  count(distinct i.recette_id)                        as recettes_touchees,
  round(sum(i.quantite * i.prix_stocke), 2)           as cout_cumule_actuel,
  round(sum(i.quantite * (c.prix_ref / f.facteur)), 2) as cout_cumule_corrige
from ingredients i
join prix_catalogue c on c.id = i.produit_id
join unite_taille tc on tc.u = c.unite_ref
join unite_taille ti on ti.u = i.ing_unite
cross join lateral (select tc.taille / ti.taille as facteur) f
where i.prix_stocke is not null
  and c.prix_ref > 0
  and tc.famille = ti.famille
  and tc.u <> ti.u
  and abs(i.prix_stocke - c.prix_ref * f.facteur)
        <= greatest(abs(c.prix_ref * f.facteur) * 0.02, 0.000001)
  and abs(i.prix_stocke - c.prix_ref / f.facteur)
        >  greatest(abs(c.prix_ref / f.facteur) * 0.02, 0.000001)
group by i.etablissement_id
order by lignes_touchees desc;
