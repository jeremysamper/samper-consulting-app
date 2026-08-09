-- ================================================================
-- MIGRATION - Alertes : destinataires nominatifs + dédup par sujet
-- Projet : Samper Consulting
-- Date   : 2026-08-09
--
-- POURQUOI :
--   Une alerte « pointage manquant » ne concernait que des RÔLES
--   (patron, resp. cuisine…). L'employé qui n'a pas pointé ne voyait
--   rien, et une seule instance agrégée était créée par règle
--   (« 3 pointages manquants ») - impossible de nommer qui.
--
--   Deux colonnes ajoutées :
--     target_user_ids : destinataires nominatifs, EN PLUS des rôles.
--     dedupe_key      : identifie le sujet de l'alerte (un shift, une
--                       zone HACCP…) pour permettre plusieurs instances
--                       actives sur une même règle sans doublon.
--
-- COMPATIBILITÉ (expand/contract) :
--   Ajout de colonnes avec valeur par défaut + élargissement de la RLS.
--   Le front déployé lit `select('*')` et ignore les nouvelles colonnes.
--   Les instances existantes gardent dedupe_key NULL : leur dédup
--   reste « une instance active par règle », comme avant.
--
-- ORDRE DE DÉPLOIEMENT :
--   Cette migration D'ABORD, puis `supabase functions deploy
--   alerts-evaluator` (l'évaluateur écrit ces deux colonnes).
-- ================================================================

-- ─── 1. COLONNES ────────────────────────────────────────────────────────────────
ALTER TABLE public.alert_instances
  ADD COLUMN IF NOT EXISTS target_user_ids text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS dedupe_key      text;

COMMENT ON COLUMN public.alert_instances.target_user_ids IS
  'auth.users.id destinataires nominatifs, en plus de target_roles (ex: l''employé qui n''a pas pointé).';
COMMENT ON COLUMN public.alert_instances.dedupe_key IS
  'Sujet de l''alerte (ex: shift:<id>, zone:<id>). NULL = une seule instance active par règle.';

-- ─── 2. INDEX ───────────────────────────────────────────────────────────────────
-- Lookup d'idempotence de l'évaluateur (rule_id + dedupe_key sur les actives)
CREATE INDEX IF NOT EXISTS idx_alert_instances_dedupe
  ON public.alert_instances(rule_id, dedupe_key) WHERE status = 'active';

-- Filtre RLS « suis-je destinataire nominatif ? »
CREATE INDEX IF NOT EXISTS idx_alert_instances_target_users
  ON public.alert_instances USING gin (target_user_ids);

-- ─── 3. RLS ÉLARGIE ─────────────────────────────────────────────────────────────
-- Un utilisateur voit une alerte s'il a le bon rôle OU s'il est nommément visé.
DROP POLICY IF EXISTS alert_instances_select ON public.alert_instances;
CREATE POLICY alert_instances_select ON public.alert_instances FOR SELECT
  USING (
    user_can_access_etab(etablissement_id)
    AND (
      current_user_role() = ANY(target_roles)
      OR ((SELECT auth.uid())::text = ANY(target_user_ids))
    )
  );

-- Même règle pour le dismiss : le destinataire nominatif peut écarter son alerte.
DROP POLICY IF EXISTS alert_instances_dismiss ON public.alert_instances;
CREATE POLICY alert_instances_dismiss ON public.alert_instances FOR UPDATE
  USING (
    user_can_access_etab(etablissement_id)
    AND (
      current_user_role() = ANY(target_roles)
      OR ((SELECT auth.uid())::text = ANY(target_user_ids))
    )
  );

-- ─── ROLLBACK (à exécuter tel quel pour revenir à l'état précédent) ────────────
--
-- DROP POLICY IF EXISTS alert_instances_select ON public.alert_instances;
-- CREATE POLICY alert_instances_select ON public.alert_instances FOR SELECT
--   USING (user_can_access_etab(etablissement_id) AND current_user_role() = ANY(target_roles));
--
-- DROP POLICY IF EXISTS alert_instances_dismiss ON public.alert_instances;
-- CREATE POLICY alert_instances_dismiss ON public.alert_instances FOR UPDATE
--   USING (user_can_access_etab(etablissement_id) AND current_user_role() = ANY(target_roles));
--
-- DROP INDEX IF EXISTS public.idx_alert_instances_target_users;
-- DROP INDEX IF EXISTS public.idx_alert_instances_dedupe;
-- ALTER TABLE public.alert_instances DROP COLUMN IF EXISTS dedupe_key;
-- ALTER TABLE public.alert_instances DROP COLUMN IF EXISTS target_user_ids;
-- ────────────────────────────────────────────────────────────────────────────────
