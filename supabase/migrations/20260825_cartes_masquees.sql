-- Cartes masquées (cachées) : une carte marquée `masquee` disparaît des onglets
-- pour TOUS les rôles sauf `consultant`, sans rien supprimer ni délier.
--
-- Différence avec `archive` (migration 20260706) :
--   · archive  = la carte est rangée pour tout le monde, consultant compris,
--                et se restaure depuis la modale « Archives ».
--   · masquee  = la carte reste vivante et éditable pour le consultant seul ;
--                la brigade ne la voit nulle part (Cartes & Recettes, Fiches
--                salle, sélecteur de carte de la mise en place).
-- Les deux drapeaux sont indépendants et cumulables.
--
-- Expand/contract : colonne ajoutée avec un défaut, le front déployé avant
-- cette migration continue de fonctionner (masquee absent = carte visible) et
-- `upsertCarte` n'écrit jamais cette colonne - seul l'update ciblé
-- `setCarteMasquee` la touche, donc renommages et syncs de plats la préservent.

ALTER TABLE cartes
  ADD COLUMN IF NOT EXISTS masquee boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN cartes.masquee IS 'Carte cachée : visible du seul rôle consultant, liaisons et contenu conservés';
