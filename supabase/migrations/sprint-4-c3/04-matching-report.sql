-- ════════════════════════════════════════════════════════════════
-- Sprint 4 · Chantier 3 · ÉTAPE 4 - Rapport post-matching
-- ────────────────────────────────────────────────────────────────
-- À exécuter APRÈS l'étape 3. Copier les deux résultats dans
-- MIGRATION-PRODUCT-MATCHING-REPORT.md (dépôt local).
-- ════════════════════════════════════════════════════════════════

-- ── Synthèse globale ──
WITH ings AS (
  SELECT jsonb_array_elements(COALESCE(r.ingredients, '[]'::jsonb)) AS ing
  FROM recettes r
)
SELECT
  count(*)                                                                          AS total_ingredients,
  count(*) FILTER (WHERE COALESCE(ing->>'produitId', '') <> '')                      AS matches_avec_produit,
  count(*) FILTER (WHERE (ing->>'needsReview')::boolean IS TRUE
                         AND ing ? 'matchSuggestions')                               AS a_valider_avec_suggestions,
  count(*) FILTER (WHERE (ing->>'needsReview')::boolean IS TRUE
                         AND NOT (ing ? 'matchSuggestions'))                         AS sans_match,
  round(
    100.0 * count(*) FILTER (WHERE COALESCE(ing->>'produitId', '') <> '')
    / GREATEST(count(*), 1)
  , 1)                                                                              AS pct_matches
FROM ings;

-- ── Top 20 des ingrédients non matchés (pour enrichir le catalogue) ──
WITH ings AS (
  SELECT jsonb_array_elements(COALESCE(r.ingredients, '[]'::jsonb)) AS ing
  FROM recettes r
)
SELECT
  lower(unaccent(trim(ing->>'nom'))) AS ingredient_normalise,
  count(*)                           AS occurrences
FROM ings
WHERE COALESCE(ing->>'produitId', '') = ''
  AND COALESCE(ing->>'nom', '') <> ''
GROUP BY 1
ORDER BY occurrences DESC, ingredient_normalise
LIMIT 20;
