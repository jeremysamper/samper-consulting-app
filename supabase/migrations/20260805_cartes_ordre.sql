-- Ordre d'affichage des cartes (menus).
-- Les onglets « Cartes & Recettes » et « Fiches salle » sortaient dans l'ordre
-- de création (created_at). Une carte saisonnière créée après coup atterrissait
-- donc forcément tout à droite, sans moyen de la remonter devant la carte de
-- base. `ordre` porte le rang choisi par l'utilisateur, partagé par toute la
-- brigade (au même titre que le nom de la carte).
--
-- Additive et non destructive : la colonne a un défaut, aucune lecture existante
-- n'est modifiée. Le front trie côté client sur `ordre ?? 0` avec un tri STABLE,
-- donc un bundle déployé AVANT cette migration continue d'afficher l'ordre
-- historique (created_at) sans erreur - seule l'action « Ordre des onglets »
-- échoue proprement tant que le SQL n'est pas appliqué.

ALTER TABLE cartes
  ADD COLUMN IF NOT EXISTS ordre integer NOT NULL DEFAULT 0;

-- Reprise : on fige l'ordre actuellement affiché (created_at croissant) comme
-- rang de départ, par établissement. Les rangs commencent à 1 : rejouer la
-- migration ne touche donc plus rien (le filtre ordre = 0 ne matche plus).
UPDATE cartes c
SET ordre = r.rang
FROM (
  SELECT id,
         (row_number() OVER (PARTITION BY etablissement_id ORDER BY created_at, id))::int AS rang
  FROM cartes
) r
WHERE c.id = r.id AND c.ordre = 0;

COMMENT ON COLUMN cartes.ordre IS 'Rang d''affichage de l''onglet (croissant, de gauche à droite) dans l''établissement ; 0 = jamais positionné, replié sur created_at';

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (à exécuter tel quel pour revenir à l'état précédent) :
--
-- ALTER TABLE cartes DROP COLUMN IF EXISTS ordre;
-- ─────────────────────────────────────────────────────────────────────────────
