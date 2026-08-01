-- ═══════════════════════════════════════════════════════════════════════════
-- Produits de la carte Été 2026 — Woodland Village (etab-2) · 01.08.2026
--
-- Création des fiches manquantes pour que l'onglet « Étiquettes DLC » du
-- module HACCP couvre toute la carte. Deux origines :
--
--   1. les préparations CITÉES dans les descriptifs de la carte et qui
--      n'avaient aucune fiche (pickles, concombre mariné, salade fraîcheur,
--      champignons, noisettes torréfiées, pesto estival) ;
--   2. les produits demandés en complément par Jérémy : entrecôte, tartare,
--      fromage, charcuterie, fondues, chocolat Danemark, gambas, sauce gambas,
--      pickles génériques.
--
-- Les glaces (Coupe Danemark, Boule de glace, Café glacé) sont volontairement
-- hors périmètre. Le « Chocolat Danemark » créé ici est la SAUCE chocolat
-- chaud, pas la coupe.
--
-- Barème de durée de vie identique à celui du 31.07.2026
-- (cf. data-20260731-dlc-woodland-village) :
--   3 j : cru, laitier frais, œuf, produit de la mer, découpe fraîche
--   5 j : cuit ou stabilisé (acide, sous-vide, blanchi, pasteurisé léger)
--   7 j : très stabilisé (sucre, sel, acide, gras, sec, fermenté)
--   duree_vie_congele_jours : durée réelle à -18 °C, NULL = ne se congèle pas
--
-- UNE exception au plancher de 3 j, assumée : le tartare de bœuf est à 1 jour.
-- Du bœuf cru taillé au couteau ne se garde pas trois jours ; c'est la même
-- logique que les langoustines basse température du 31.07.2026.
--
-- Ces fiches sont des SQUELETTES : ni ingrédients, ni étapes, ni allergènes.
-- Elles existent pour l'étiquetage. Le champ notes_consultant le dit, et les
-- durées restent à confirmer par l'autocontrôle fiche par fiche.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

insert into recettes (
  id, etablissement_id, nom, categorie, statut, portions,
  duree_vie_jours, duree_vie_congele_jours, duree_vie_decongele_jours,
  congelable, notes_consultant
)
values

  -- ─── Préparations citées sur la carte, sans fiche jusqu'ici ──────────────
  ('rec-1785542400000-pkoinv', 'etab-2', 'Pickles d''oignon nouveau', 'Entrées', 'brouillon', 4,
   7, null, 2, false,
   'Fiche créée le 01.08.2026 pour l''étiquetage DLC (carte Été 2026). Saumure vinaigrée : 7 j. Durées à confirmer par l''autocontrôle.'),

  ('rec-1785542400000-pkoirg', 'etab-2', 'Pickles d''oignon rouge', 'Entrées', 'brouillon', 4,
   7, null, 2, false,
   'Fiche créée le 01.08.2026 pour l''étiquetage DLC (carte Été 2026). Saumure vinaigrée : 7 j. Durées à confirmer par l''autocontrôle.'),

  ('rec-1785542400000-pklgen', 'etab-2', 'Pickles', 'Entrées', 'brouillon', 4,
   7, null, 2, false,
   'Fiche créée le 01.08.2026 pour l''étiquetage DLC (carte Été 2026). Bocal de pickles du jour, toutes garnitures. Durées à confirmer par l''autocontrôle.'),

  ('rec-1785542400000-cncmar', 'etab-2', 'Concombre mariné', 'Entrées', 'brouillon', 4,
   5, null, 2, false,
   'Fiche créée le 01.08.2026 pour l''étiquetage DLC (carte Été 2026). Marinade légère sur légume cru gorgé d''eau : 5 j et non 7. Durées à confirmer par l''autocontrôle.'),

  ('rec-1785542400000-saldfr', 'etab-2', 'Salade fraîcheur', 'Entrées', 'brouillon', 4,
   3, null, 2, false,
   'Fiche créée le 01.08.2026 pour l''étiquetage DLC (carte Été 2026). Mesclun lavé, découpe fraîche crue : 3 j. Durées à confirmer par l''autocontrôle.'),

  ('rec-1785542400000-champe', 'etab-2', 'Champignons d''été poêlés', 'Plats', 'brouillon', 4,
   5, 90, 2, true,
   'Fiche créée le 01.08.2026 pour l''étiquetage DLC (carte Été 2026). Cuit à la poêle : 5 j. Durées à confirmer par l''autocontrôle.'),

  ('rec-1785542400000-nsttor', 'etab-2', 'Noisettes torréfiées', 'Plats', 'brouillon', 4,
   7, null, 2, false,
   'Fiche créée le 01.08.2026 pour l''étiquetage DLC (carte Été 2026). Sec et gras, boîte hermétique : 7 j, comme la poudre de lard et les chips de viande séchée. Durées à confirmer par l''autocontrôle.'),

  ('rec-1785542400000-pstest', 'etab-2', 'Pesto estival', 'Sauces', 'brouillon', 4,
   5, 90, 2, true,
   'Fiche créée le 01.08.2026 pour l''étiquetage DLC (carte Été 2026). Aligné sur le pesto de pécan (5 j / 90 j). Durées à confirmer par l''autocontrôle.'),

  -- ─── Produits demandés en complément ────────────────────────────────────
  ('rec-1785542400000-entrec', 'etab-2', 'Entrecôte de bœuf', 'Plats', 'brouillon', 4,
   3, 90, 2, true,
   'Fiche créée le 01.08.2026 pour l''étiquetage DLC (carte Été 2026). Viande crue portionnée : 3 j au froid positif. Durées à confirmer par l''autocontrôle.'),

  ('rec-1785542400000-tartbf', 'etab-2', 'Tartare de bœuf', 'Plats', 'brouillon', 4,
   1, null, 2, false,
   'Fiche créée le 01.08.2026 pour l''étiquetage DLC (carte Été 2026). EXCEPTION au barème : bœuf cru taillé au couteau, 1 jour et non 3, et jamais congelé. Même logique que les langoustines basse température. Durée à confirmer par l''autocontrôle.'),

  ('rec-1785542400000-fromag', 'etab-2', 'Fromage', 'Fromages', 'brouillon', 4,
   7, null, 2, false,
   'Fiche créée le 01.08.2026 pour l''étiquetage DLC (carte Été 2026). Fromage affiné portionné (assortiment, planchette) : 7 j. Durées à confirmer par l''autocontrôle.'),

  ('rec-1785542400000-charcu', 'etab-2', 'Charcuterie', 'Entrées', 'brouillon', 4,
   7, null, 2, false,
   'Fiche créée le 01.08.2026 pour l''étiquetage DLC (carte Été 2026). Salée et séchée (planchette) : 7 j. Durées à confirmer par l''autocontrôle.'),

  ('rec-1785542400000-fondnt', 'etab-2', 'Fondue nature', 'Plats', 'brouillon', 4,
   5, 90, 2, true,
   'Fiche créée le 01.08.2026 pour l''étiquetage DLC (carte Été 2026). Mélange fromage + vin blanc, stabilisé par l''acide : 5 j. Durées à confirmer par l''autocontrôle.'),

  ('rec-1785542400000-fondas', 'etab-2', 'Fondue assaisonnée', 'Plats', 'brouillon', 4,
   5, 90, 2, true,
   'Fiche créée le 01.08.2026 pour l''étiquetage DLC (carte Été 2026). Mélange fromage + vin blanc assaisonné : 5 j. Durées à confirmer par l''autocontrôle.'),

  ('rec-1785542400000-chocdk', 'etab-2', 'Chocolat Danemark', 'Desserts', 'brouillon', 4,
   7, null, 2, false,
   'Fiche créée le 01.08.2026 pour l''étiquetage DLC (carte Été 2026). Sauce chocolat chaud de la coupe Danemark — la glace elle-même est hors périmètre. Sucre et gras : 7 j. Durées à confirmer par l''autocontrôle.'),

  ('rec-1785542400000-gambas', 'etab-2', 'Gambas', 'Plats', 'brouillon', 4,
   3, null, 2, false,
   'Fiche créée le 01.08.2026 pour l''étiquetage DLC (carte Été 2026). Crustacé cru : 3 j, et non congelable — livrées décongelées, on ne recongèle pas. Durées à confirmer par l''autocontrôle.'),

  ('rec-1785542400000-sagamb', 'etab-2', 'Sauce Gambas', 'Sauces', 'brouillon', 4,
   5, 90, 2, true,
   'Fiche créée le 01.08.2026 pour l''étiquetage DLC (carte Été 2026). Bisque cuite, donc pasteurisée : 5 j. Durées à confirmer par l''autocontrôle.');

commit;
