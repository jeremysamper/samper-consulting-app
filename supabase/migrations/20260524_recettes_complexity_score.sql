-- Ajout des colonnes complexity_score sur la table recettes.
-- Les scores sont calculés par l'IA (tâche analyse-simulation-carte)
-- et persistés pour éviter de relancer l'analyse à chaque ouverture.

ALTER TABLE recettes
  ADD COLUMN IF NOT EXISTS complexity_score     integer     CHECK (complexity_score BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS complexity_note      text,
  ADD COLUMN IF NOT EXISTS complexity_updated_at timestamptz;

COMMENT ON COLUMN recettes.complexity_score      IS 'Score de complexité 1-5 calculé par IA (analyse-simulation-carte)';
COMMENT ON COLUMN recettes.complexity_note       IS 'Justification courte du score (1 phrase, générée par IA)';
COMMENT ON COLUMN recettes.complexity_updated_at IS 'Horodatage de la dernière analyse IA';
