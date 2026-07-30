-- ═══════════════════════════════════════════════════════════════════════════
-- Durees de vie des preparations : trois colonnes sur `recettes`
-- ───────────────────────────────────────────────────────────────────────────
-- Support du poste d'etiquetage DLC (onglet Etiquettes du module HACCP).
-- Les durees relevent de l'autocontrole de l'etablissement : elles sont
-- saisies par le responsable cuisine sur la fiche recette, JAMAIS calculees
-- par le systeme.
--
-- Migration additive uniquement (expand) : aucune colonne existante n'est
-- touchee, le front deploye continue de fonctionner sans rien connaitre de
-- ces colonnes. Idempotente, rejouable sans erreur.
--
-- Pas de nouvelle table -> aucune politique RLS a creer. Les politiques
-- existantes sur `recettes` (recettes_select / _insert / _update / _delete,
-- toutes en `user_can_access_etab(etablissement_id)` pour le role
-- `authenticated`) couvrent deja la lecture par l'onglet Etiquettes et
-- l'ecriture depuis la fiche recette. Aucun ajustement necessaire.
--
-- Pas de nouvel index : aucune de ces colonnes n'est un critere de filtre.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Colonnes ───────────────────────────────────────────────────────────
ALTER TABLE recettes
  ADD COLUMN IF NOT EXISTS duree_vie_jours integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS duree_vie_congele_jours integer NULL,
  ADD COLUMN IF NOT EXISTS duree_vie_decongele_jours integer NOT NULL DEFAULT 2;

-- ─── 2. Contraintes CHECK ──────────────────────────────────────────────────
-- `ADD CONSTRAINT IF NOT EXISTS` n'existe pas en PostgreSQL : la garde
-- d'existence se fait dans un bloc DO, sinon la migration echoue au rejeu.
-- `duree_vie_congele_jours > 0` : un CHECK ne rejette pas NULL (resultat
-- UNKNOWN), la valeur NULL « non congelable » reste donc autorisee.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.recettes'::regclass
      AND conname = 'recettes_duree_vie_jours_positive'
  ) THEN
    ALTER TABLE recettes
      ADD CONSTRAINT recettes_duree_vie_jours_positive
      CHECK (duree_vie_jours > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.recettes'::regclass
      AND conname = 'recettes_duree_vie_congele_jours_positive'
  ) THEN
    ALTER TABLE recettes
      ADD CONSTRAINT recettes_duree_vie_congele_jours_positive
      CHECK (duree_vie_congele_jours > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.recettes'::regclass
      AND conname = 'recettes_duree_vie_decongele_jours_positive'
  ) THEN
    ALTER TABLE recettes
      ADD CONSTRAINT recettes_duree_vie_decongele_jours_positive
      CHECK (duree_vie_decongele_jours > 0);
  END IF;
END $$;

-- ─── 3. Commentaires ───────────────────────────────────────────────────────
COMMENT ON COLUMN recettes.duree_vie_jours IS
  'Duree de vie en froid positif, en jours. Definie par le responsable cuisine, jamais calculee par le systeme.';

COMMENT ON COLUMN recettes.duree_vie_congele_jours IS
  'Duree de vie en surgele, en jours. NULL signifie preparation non congelable : les modes surgelation et decongelation sont alors indisponibles.';

COMMENT ON COLUMN recettes.duree_vie_decongele_jours IS
  'Duree de vie apres decongelation, en jours. Defaut 2. Pertinente uniquement si la preparation est congelable.';

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK (a jouer manuellement si besoin)
-- ───────────────────────────────────────────────────────────────────────────
-- Les contraintes CHECK partent avec leurs colonnes, pas de DROP separe.
--
-- ALTER TABLE recettes DROP COLUMN IF EXISTS duree_vie_jours;
-- ALTER TABLE recettes DROP COLUMN IF EXISTS duree_vie_congele_jours;
-- ALTER TABLE recettes DROP COLUMN IF EXISTS duree_vie_decongele_jours;
-- ═══════════════════════════════════════════════════════════════════════════
