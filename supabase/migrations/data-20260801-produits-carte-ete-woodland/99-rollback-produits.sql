-- ═══════════════════════════════════════════════════════════════════════════
-- Retour arrière du 01.08.2026 — produits de la carte Été 2026, Woodland Village
--
-- Les 17 fiches créées par 01-apply-produits.sql n'existaient pas avant : le
-- retour arrière est une simple suppression, il n'y a aucun état antérieur à
-- restaurer.
--
-- ATTENTION : à ne jouer que si aucune de ces fiches n'a été enrichie depuis
-- (ingrédients, étapes, rattachement à un plat). La requête de contrôle
-- ci-dessous le vérifie AVANT la suppression.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Contrôle préalable : ces fiches sont-elles restées des squelettes ? ───
select r.id, r.nom,
       jsonb_array_length(coalesce(r.ingredients, '[]'::jsonb)) as nb_ingredients,
       jsonb_array_length(coalesce(r.etapes, '[]'::jsonb))      as nb_etapes,
       (select count(*) from plat_recettes pr where pr.recette_id = r.id) as nb_plats
from recettes r
where r.id like 'rec-1785542400000-%'
order by r.nom;

-- ─── Suppression ──────────────────────────────────────────────────────────
begin;

delete from plat_recettes where recette_id like 'rec-1785542400000-%';

delete from recettes
where etablissement_id = 'etab-2'
  and id in (
    'rec-1785542400000-pkoinv',  -- Pickles d'oignon nouveau
    'rec-1785542400000-pkoirg',  -- Pickles d'oignon rouge
    'rec-1785542400000-pklgen',  -- Pickles
    'rec-1785542400000-cncmar',  -- Concombre mariné
    'rec-1785542400000-saldfr',  -- Salade fraîcheur
    'rec-1785542400000-champe',  -- Champignons d'été poêlés
    'rec-1785542400000-nsttor',  -- Noisettes torréfiées
    'rec-1785542400000-pstest',  -- Pesto estival
    'rec-1785542400000-entrec',  -- Entrecôte de bœuf
    'rec-1785542400000-tartbf',  -- Tartare de bœuf
    'rec-1785542400000-fromag',  -- Fromage
    'rec-1785542400000-charcu',  -- Charcuterie
    'rec-1785542400000-fondnt',  -- Fondue nature
    'rec-1785542400000-fondas',  -- Fondue assaisonnée
    'rec-1785542400000-chocdk',  -- Chocolat Danemark
    'rec-1785542400000-gambas',  -- Gambas
    'rec-1785542400000-sagamb'   -- Sauce Gambas
  );

commit;
