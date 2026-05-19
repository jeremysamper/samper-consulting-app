-- Fiches salle : ajout d'une colonne « accords généraux ».
-- Liste de familles de boissons recommandées (texte libre, ex. « Vin rouge
-- corsé », « Vin blanc sec ») servant de repli quand la référence précise
-- d'un accord n'est pas disponible en cave.
ALTER TABLE fiches_salle
  ADD COLUMN IF NOT EXISTS accords_generaux jsonb NOT NULL DEFAULT '[]'::jsonb;
