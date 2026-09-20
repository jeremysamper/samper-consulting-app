-- ============================================================================
-- Tables de sauvegarde ponctuelles : fermeture de l'API et RLS
--
-- Alerte Security Advisor du 13.09.2026 (rls_disabled_in_public) :
-- `public.backup_recettes_ingredients_20260811` est dans le schéma exposé à
-- PostgREST sans RLS. Deux tables sont concernées, pas une :
--
--   · backup_recettes_ingredients_20260811 (15 lignes) - snapshot des recettes
--     d'etab-2 pris avant la réparation des produitId orphelins
--     (data-20260811-produitid-orphelins/00-sauvegarde.sql).
--   · bak_20260812_liaison_ingredients (185 lignes) - snapshot de la liaison
--     ingrédients Woodland (data-20260812-liaison-ingredients-woodland).
--
-- Exposition réelle mesurée avant correctif (harness begin/rollback en
-- incarnant un cuisinier d'etab-1, 20.09.2026) :
--   · backup_recettes_… : LIT 15 lignes  <- fuite cross-tenant
--   · témoin recettes etab-2 (RLS active) : LIT 0 ligne
--   · bak_20260812_… : aucun grant anon ni authenticated, déjà injoignable
--
-- Le mail Supabase annonce « anyone with your project URL » : faux ici, le rôle
-- anon n'a plus aucun privilège depuis I1/I1b (migrations 20260713). Le risque
-- est interne mais bien réel : tout compte connecté, de n'importe quel
-- établissement, pouvait lire ces recettes et leurs prix - et les grants par
-- défaut incluent DELETE et TRUNCATE, donc effacer la sauvegarde elle-même.
--
-- Cause : une table créée à la main dans `public` hérite des privilèges par
-- défaut de `authenticated`. Une sauvegarde ponctuelle n'a rien à faire dans le
-- schéma exposé ; à l'avenir la créer hors de `public`.
--
-- Correctif : fermeture des privilèges + RLS sans aucune policy (personne ne
-- passe, sauf postgres et service_role qui contournent la RLS). Les données
-- sont conservées : 99-rollback.sql reste exécutable depuis le SQL Editor.
--
-- Garde `to_regclass` : ces tables sont nées hors versioning (drift), la
-- migration doit rester rejouable après leur suppression éventuelle.
--
-- ROLLBACK : aucun besoin côté app, rien dans src/ ne lit ces tables (vérifié
-- par grep le 20.09.2026). Pour rouvrir ponctuellement, passer par le SQL
-- Editor (rôle postgres), pas par un grant.
-- ============================================================================

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'public.backup_recettes_ingredients_20260811',
    'public.bak_20260812_liaison_ingredients'
  ] LOOP
    IF to_regclass(t) IS NULL THEN
      RAISE NOTICE 'Table % absente, rien à faire', t;
      CONTINUE;
    END IF;

    EXECUTE format('REVOKE ALL ON TABLE %s FROM anon, authenticated, PUBLIC', t);
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'COMMENT ON TABLE %s IS %L', t,
      'Sauvegarde ponctuelle hors app : aucun privilège anon/authenticated, RLS active sans policy. Lecture par le SQL Editor uniquement. Supprimable une fois la fenêtre de rollback close.'
    );

    RAISE NOTICE 'Fermée : %', t;
  END LOOP;
END $$;
