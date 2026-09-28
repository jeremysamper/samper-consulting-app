-- Recettes cachées : une recette marquée `masquee` disparaît du module
-- Cartes & Recettes pour TOUS les rôles, consultant compris, et reste entière
-- dans Outils consultant (liste, édition, chiffrage, rattachement aux plats).
--
-- Différence avec le statut 'archivée' :
--   · archivée = la recette sort de toute l'app (bibliothèque, plats, MEP,
--                commande, étiquettes DLC, fiches salle...).
--   · masquee  = seul le module Cartes & Recettes l'ignore ; la production
--                (MEP, commande, étiquettes) continue de la lire. Les allergènes
--                d'un plat restent calculés sur toutes ses recettes, cachées
--                comprises.
-- Les deux sont indépendants et cumulables.
--
-- Expand/contract : colonne ajoutée avec un défaut, le front déployé avant
-- cette migration continue de fonctionner (masquee absent = recette visible) et
-- `upsertRecette` n'écrit jamais cette colonne - seul l'update ciblé
-- `setRecettesMasquees` la touche, donc la sauvegarde automatique de l'éditeur
-- ne peut pas écraser une bascule faite entre-temps.
--
-- Rollback : ALTER TABLE recettes DROP COLUMN IF EXISTS masquee;
-- (seulement une fois qu'aucun front déployé ne lit plus la colonne)

ALTER TABLE recettes
  ADD COLUMN IF NOT EXISTS masquee boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN recettes.masquee IS 'Recette cachée du module Cartes & Recettes (tous rôles), conservée dans Outils consultant et en production';
