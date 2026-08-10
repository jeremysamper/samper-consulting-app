-- Périmètre d'inventaire (inventaires.nom).
--
-- Un établissement ne fait pas UN inventaire : il en fait plusieurs en
-- parallèle, chacun tenu par une équipe différente et à un rythme différent
-- (cuisine mensuelle, boissons hebdomadaire, matériel trimestriel...). Le
-- module n'exposait qu'une liste plate triée par date : deux inventaires du
-- même jour étaient indiscernables et la comparaison « vs précédent »
-- confrontait la cave à l'économat.
--
-- `nom` porte le périmètre. Additive et non destructive :
--   - les lignes existantes reçoivent le défaut « Général » ;
--   - un bundle déployé AVANT cette migration n'envoie pas la colonne et
--     retombe sur le défaut, donc rien ne casse ;
--   - un bundle déployé APRÈS envoie toujours une valeur non vide (le front
--     replie sur « Général » quand la saisie est laissée vide).

ALTER TABLE inventaires
  ADD COLUMN IF NOT EXISTS nom text NOT NULL DEFAULT 'Général';

-- Reprise : les inventaires antérieurs n'avaient pas de périmètre. Ils
-- deviennent le périmètre « Général » plutôt que d'être devinés « Cuisine »,
-- qui serait faux pour un établissement qui n'y stockait que ses boissons.
UPDATE inventaires
SET nom = 'Général'
WHERE nom IS NULL OR btrim(nom) = '';

COMMENT ON COLUMN inventaires.nom IS 'Périmètre de l''inventaire (Cuisine, Boissons, Matériel...) ; « Général » = inventaire unique historique';

-- Pas de contrainte d'unicité (établissement, périmètre, date) : le front
-- déployé aujourd'hui crée un inventaire daté du jour à chaque clic, deux clics
-- lèveraient une violation de clé en pleine saisie. Le doublon est intercepté
-- côté front (confirmation avant création), pas par une erreur Postgres brute.

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (à exécuter tel quel pour revenir à l'état précédent) :
--
-- ALTER TABLE inventaires DROP COLUMN IF EXISTS nom;
-- ─────────────────────────────────────────────────────────────────────────────
