-- Correction du prix catalogue de « Economy Huile pour friture » (etab-2).
-- APPLIQUÉ EN PRODUCTION LE 12.08.2026. Trace, non rejoué par la CLI.
--
-- Constat : prix_unitaire = 0.189 CHF/ml, soit 189 CHF le litre et 3 780 CHF la
-- caisse de 20 l. Aberrant face aux autres huiles du MÊME catalogue :
--   Quality Huile de tournesol           4.45 CHF/l  (bouteille 1 l)
--   Economy Huile d'olive vierge extra   7.09 CHF/l  (caisse 10 l)
--
-- Les trois valeurs en présence partagent les mêmes chiffres, seule la virgule bouge :
--   0.189     -> 189.00 CHF/l -> 3 780.00 la caisse   (catalogue, aberrant)
--   0.00189   ->   1.89 CHF/l ->    37.80 la caisse   (figé dans « Vinaigrette
--                                                       balsamique miel », retenu)
--   0.000189  ->   0.19 CHF/l ->     3.78 la caisse   (figé dans « Huile de basilic »)
--
-- 0.00189 est la seule qui donne un prix de caisse plausible, et c'est la valeur
-- qui avait été figée dans une recette avant que le catalogue ne dérive.
--
-- Effet : « Vinaigrette balsamique miel » passe de 1 890.00 à 18.90 CHF pour ses
-- 10 l d'huile, « Huile de basilic » de 189.00 à 1.89 CHF.

begin;

-- L'historique garde la valeur erronée puis la corrigée : la fiche produit montre
-- d'où l'on vient, sinon la correction serait invisible.
insert into produit_prix_historique (id, produit_id, prix_unitaire, source, releve_le)
select 'pph-fix-huile-avant', p.id, p.prix_unitaire, 'manuel', current_date
from produits p
where p.etablissement_id = 'etab-2' and p.nom = 'Economy Huile pour friture'
on conflict (id) do nothing;

update produits
set prix_unitaire = 0.00189,
    prix_maj_le   = now(),
    notes = coalesce(nullif(trim(notes), '') || E'\n', '')
            || 'Prix corrige le 12.08.2026 : 0.189 -> 0.00189 CHF/ml (facteur 100). '
            || '189 CHF/l etait aberrant face au tournesol a 4.45 et a l''olive a 7.09 ; '
            || '0.00189 donne 37.80 CHF la caisse de 20 l et correspond au prix fige des recettes.'
where etablissement_id = 'etab-2' and nom = 'Economy Huile pour friture';

insert into produit_prix_historique (id, produit_id, prix_unitaire, source, releve_le)
select 'pph-fix-huile-apres', p.id, 0.00189, 'manuel', current_date
from produits p
where p.etablissement_id = 'etab-2' and p.nom = 'Economy Huile pour friture'
on conflict (id) do nothing;

commit;

-- Contrôle : 1.89 CHF/l, 37.80 la caisse, et plus aucun écart x50 dans etab-2.
select nom, prix_unitaire,
       round(prix_unitaire * 1000, 2)  as chf_par_litre,
       round(prix_unitaire * 20000, 2) as chf_la_caisse,
       produit_prix_resolu(id)         as prix_resolu
from produits
where etablissement_id = 'etab-2' and nom = 'Economy Huile pour friture';
