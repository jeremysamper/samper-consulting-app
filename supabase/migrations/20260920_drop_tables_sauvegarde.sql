-- ============================================================================
-- Suppression des deux tables de sauvegarde ponctuelles
--
-- Elles étaient nées hors versioning lors des réparations de données des 11 et
-- 12.08.2026, toutes deux appliquées et vérifiées en production depuis :
--   · backup_recettes_ingredients_20260811 (data-20260811-produitid-orphelins)
--   · bak_20260812_liaison_ingredients (data-20260812-liaison-ingredients-woodland)
--
-- Aucun code de src/ ou api/ ne les lit. La migration 20260920_securiser_
-- tables_sauvegarde les avait d'abord fermées (revoke + RLS) ; leur suppression
-- referme le sujet pour de bon.
--
-- Copie hors dépôt conservée avant suppression (donnée client, jamais commitée) :
--   C:\Users\jerem\Documents\App-Web\_sauvegardes-supabase\tables-sauvegarde-avant-drop-20260920.json
--   · table 1 : les 15 recettes, 88 lignes d'ingrédient, en entier
--   · table 2 : les 46 recettes qui divergeaient encore de `recettes`, 369
--     lignes d'ingrédient, en entier ; les 139 autres étaient identiques à la
--     production au 20.09.2026, seuls leurs ids sont listés.
--
-- Pas de CASCADE volontairement : si une dépendance avait existé, la migration
-- aurait échoué plutôt que d'emporter autre chose avec elle.
--
-- ROLLBACK : recréer les tables depuis le JSON ci-dessus. Attention, restaurer
-- `recettes.ingredients` depuis ces snapshots écraserait six semaines de
-- modifications de la brigade : c'est une archive de consultation, pas un
-- retour arrière prêt à l'emploi.
-- ============================================================================

DROP TABLE IF EXISTS public.backup_recettes_ingredients_20260811;
DROP TABLE IF EXISTS public.bak_20260812_liaison_ingredients;
