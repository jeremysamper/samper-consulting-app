-- Archivage des cartes (menus).
-- Une carte archivée disparaît des onglets (Cartes & Recettes, Fiches salle),
-- du rattachement de plats et de la génération de commande, sans perdre ses
-- liaisons carte_plats / carte_fiches_salle. Restaurable depuis la modale Archives.
-- Les recettes n'ont pas besoin de colonne : le statut 'archivée' existant est utilisé.

ALTER TABLE cartes
  ADD COLUMN IF NOT EXISTS archive boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN cartes.archive IS 'Carte archivée : masquée des onglets et listes actives, liaisons conservées, restaurable';
