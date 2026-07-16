-- ════════════════════════════════════════════════════════════════
-- Sprint 4 · Chantier 3 · ÉTAPE 3 - Matching rétroactif produits
-- ────────────────────────────────────────────────────────────────
-- Rapproche chaque ingrédient de recette (sans produitId) d'un produit
-- du catalogue du MÊME établissement.
--   - match exact normalisé           -> produitId assigné (confiance 100)
--   - Levenshtein <= 2                 -> produitId assigné (confiance 85)
--   - Levenshtein 3-4 / trigram >= 0.3 -> needsReview + matchSuggestions
--   - aucun                            -> needsReview, sans suggestion
-- Idempotent : un ingrédient déjà matché (produitId non vide) est ignoré.
-- À exécuter APRÈS les étapes 1 et 2.
-- ════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- ── Table de synonymes culinaires (variantes orthographiques) ──
CREATE TABLE IF NOT EXISTS recipe_synonyms (
  variant   text PRIMARY KEY,
  canonical text NOT NULL
);
INSERT INTO recipe_synonyms (variant, canonical) VALUES
  ('echalotte', 'echalote'),
  ('echalion', 'echalote'),
  ('ognon', 'oignon'),
  ('yogourt', 'yaourt'),
  ('yoghourt', 'yaourt'),
  ('beuf', 'boeuf')
ON CONFLICT (variant) DO UPDATE SET canonical = EXCLUDED.canonical;

-- ── Fonction de matching ──
CREATE OR REPLACE FUNCTION match_recipe_ingredients()
RETURNS jsonb AS $$
DECLARE
  rec            RECORD;
  ing            jsonb;
  new_ings       jsonb;
  ing_nom        text;
  ing_norm       text;
  syn            text;
  v_pid          text;
  v_dist         int;
  v_sugg         jsonb;
  total          int := 0;
  cnt_matched    int := 0;
  cnt_review     int := 0;
  cnt_nomatch    int := 0;
  cnt_skipped    int := 0;
  recipes_done   int := 0;
BEGIN
  FOR rec IN SELECT id, etablissement_id, COALESCE(ingredients, '[]'::jsonb) AS ingredients FROM recettes LOOP
    -- Sous-bloc par recette : une erreur isolée ne casse pas le traitement global.
    BEGIN
      new_ings := '[]'::jsonb;

      FOR ing IN SELECT value FROM jsonb_array_elements(rec.ingredients) LOOP
        total := total + 1;

        -- Déjà matché -> on garde tel quel.
        IF COALESCE(ing->>'produitId', '') <> '' THEN
          new_ings := new_ings || ing;
          cnt_skipped := cnt_skipped + 1;
          CONTINUE;
        END IF;

        ing_nom  := COALESCE(ing->>'nom', '');
        ing_norm := lower(unaccent(trim(ing_nom)));

        -- Ingrédient non commercial isolé -> non matchable.
        IF ing_norm = ANY (ARRAY['sel', 'poivre', 'eau', 'glace']) THEN
          new_ings := new_ings || jsonb_set(ing - 'matchSuggestions', '{needsReview}', 'true'::jsonb);
          cnt_nomatch := cnt_nomatch + 1;
          CONTINUE;
        END IF;

        -- Synonyme éventuel (variante orthographique).
        SELECT canonical INTO syn FROM recipe_synonyms WHERE variant = ing_norm;

        -- ── Passe 1 : match exact normalisé ──
        v_pid := NULL;
        SELECT p.id INTO v_pid
          FROM produits p
         WHERE p.etablissement_id = rec.etablissement_id
           AND lower(unaccent(p.nom)) IN (ing_norm, COALESCE(syn, ing_norm))
         LIMIT 1;

        IF v_pid IS NOT NULL THEN
          new_ings := new_ings || jsonb_set(ing - 'needsReview' - 'matchSuggestions', '{produitId}', to_jsonb(v_pid));
          cnt_matched := cnt_matched + 1;
          CONTINUE;
        END IF;

        -- ── Passe 2 : Levenshtein ──
        v_pid := NULL; v_dist := NULL;
        SELECT p.id, levenshtein(lower(unaccent(p.nom)), ing_norm)
          INTO v_pid, v_dist
          FROM produits p
         WHERE p.etablissement_id = rec.etablissement_id
         ORDER BY 2 ASC
         LIMIT 1;

        IF v_dist IS NOT NULL AND v_dist <= 2 THEN
          new_ings := new_ings || jsonb_set(ing - 'needsReview' - 'matchSuggestions', '{produitId}', to_jsonb(v_pid));
          cnt_matched := cnt_matched + 1;
          CONTINUE;
        END IF;

        -- ── Passe 3 : suggestions (Levenshtein 3-4 ou trigram) ──
        SELECT jsonb_agg(s ORDER BY (s->>'confidence')::int DESC)
          INTO v_sugg
          FROM (
            SELECT jsonb_build_object(
                     'produitId', p.id,
                     'nom', p.nom,
                     'confidence',
                       GREATEST(0, LEAST(100, round(
                         similarity(lower(unaccent(p.nom)), ing_norm) * 100
                       )))::int
                   ) AS s
              FROM produits p
             WHERE p.etablissement_id = rec.etablissement_id
               AND ( levenshtein(lower(unaccent(p.nom)), ing_norm) <= 4
                     OR similarity(lower(unaccent(p.nom)), ing_norm) >= 0.3 )
             ORDER BY similarity(lower(unaccent(p.nom)), ing_norm) DESC
             LIMIT 5
          ) sub;

        ing := jsonb_set(ing - 'produitId', '{needsReview}', 'true'::jsonb);
        IF v_sugg IS NOT NULL THEN
          ing := jsonb_set(ing, '{matchSuggestions}', v_sugg);
          cnt_review := cnt_review + 1;
        ELSE
          ing := ing - 'matchSuggestions';
          cnt_nomatch := cnt_nomatch + 1;
        END IF;
        new_ings := new_ings || ing;
      END LOOP;

      UPDATE recettes SET ingredients = new_ings WHERE id = rec.id;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Recette % ignorée (erreur : %)', rec.id, SQLERRM;
    END;

    recipes_done := recipes_done + 1;
    IF recipes_done % 100 = 0 THEN
      RAISE NOTICE '... % recettes traitées', recipes_done;
    END IF;
  END LOOP;

  RAISE NOTICE 'Matching terminé : % recettes · % ingrédients · % matchés · % à valider · % sans match · % déjà liés',
    recipes_done, total, cnt_matched, cnt_review, cnt_nomatch, cnt_skipped;

  RETURN jsonb_build_object(
    'recettes', recipes_done,
    'ingredients', total,
    'matchedAuto', cnt_matched,
    'needsReview', cnt_review,
    'noMatch', cnt_nomatch,
    'alreadyLinked', cnt_skipped
  );
END;
$$ LANGUAGE plpgsql;

-- ── Exécution ──
SELECT match_recipe_ingredients() AS rapport;
