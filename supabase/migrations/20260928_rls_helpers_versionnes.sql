-- ============================================================================
-- Rattrapage : les helpers RLS user_can_access_etab et current_user_role
-- entrent dans le dépôt
--
-- APPLIQUÉ EN PROD via MCP le 28.09.2026, après essai à blanc (migration jouée
-- deux fois en transaction annulée : définitions, OID, droits et commentaires
-- identiques ; 211 / 84 policies intactes). Advisor inchangé. Miroir repo == prod.
--
-- Ces deux fonctions portent le scoping de la quasi-totalité des policies
-- (211 et 84 policies au 28.09.2026), mais aucune migration ne les créait :
-- elles avaient été posées directement en base, et le dépôt n'en gardait que
-- des ALTER (20260611_perf_indexes_rls.sql, search_path) et des commentaires
-- (20260920_secdef_0029_resserrage.sql). Ce fichier fige leur état de prod,
-- relevé le 28.09.2026 (pg_get_functiondef, proacl, obj_description).
-- current_user_etab_ids(), troisième helper, est déjà versionné dans
-- 20260712_rls_scope_profiles_etablissements.sql.
--
-- Effet en prod : aucun. Même signature, même corps (aux fins de ligne près),
-- mêmes attributs, mêmes droits, même commentaire. CREATE OR REPLACE garde
-- l'OID : les policies qui en dépendent ne bougent pas. Idempotent, rejouable.
-- Sur une base neuve : crée les deux fonctions avec les droits de prod
-- (EXECUTE pour authenticated et service_role, rien pour anon ni PUBLIC).
-- Prérequis : la table profiles (id text, role text, etablissement_ids text[]).
--
-- Toute évolution de ces fonctions passe par une nouvelle migration qui les
-- recrée, pour que le dépôt reste le miroir de la base.
--
-- ROLLBACK : aucun, rien ne change. Ne JAMAIS les supprimer : 211 + 84
-- policies en dépendent.
-- ============================================================================

-- ── user_can_access_etab(text) ──────────────────────────────────────────────
-- Vrai si l'établissement figure dans profiles.etablissement_ids de
-- l'appelant. Aucun passe-droit consultant : le consultant n'accède qu'à ses
-- établissements. Le nom du paramètre (etab_id) fait partie de la signature
-- vue par CREATE OR REPLACE : ne pas le renommer.
create or replace function public.user_can_access_etab(etab_id text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  SELECT COALESCE(
    (SELECT etab_id = ANY(etablissement_ids)
     FROM profiles WHERE id = auth.uid()::text LIMIT 1),
    false
  );
$function$;

-- ── current_user_role() ─────────────────────────────────────────────────────
-- Rôle de l'appelant. Renvoie '' (jamais NULL) sans session ou sans profil :
-- pour reconnaître le SQL Editor ou service_role, tester auth.uid() is null.
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  SELECT COALESCE(
    (SELECT role FROM profiles WHERE id = auth.uid()::text LIMIT 1),
    ''
  );
$function$;

-- ── Droits : ceux de la prod ────────────────────────────────────────────────
-- Grant avant revoke, comme dans I1b : authenticated garde EXECUTE à tout
-- instant (les policies s'évaluent sous son rôle).
grant execute on function public.user_can_access_etab(text) to authenticated, service_role;
grant execute on function public.current_user_role()        to authenticated, service_role;
revoke execute on function public.user_can_access_etab(text) from anon, public;
revoke execute on function public.current_user_role()        from anon, public;

-- ── Commentaires : ceux posés par 20260920_secdef_0029_resserrage.sql ───────
comment on function public.user_can_access_etab(text) is
  'Helper RLS utilisé par la quasi-totalité des policies. SECURITY DEFINER pour lire profiles sans récursion RLS. Ne répond que sur le périmètre de l''appelant (false pour un établissement étranger comme pour un identifiant inexistant). Advisor 0029 attendu.';
comment on function public.current_user_role() is
  'Helper RLS utilisé par la plupart des policies. SECURITY DEFINER pour lire profiles sans récursion RLS ; authenticated doit garder EXECUTE, les policies s''évaluent sous son rôle. Ne renvoie que le rôle de l''appelant. Advisor 0029 attendu.';

-- Vérification (2 lignes, prosecdef = true, proconfig = {"search_path=public, pg_temp"},
-- proacl = {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}) :
--   select p.oid::regprocedure, p.prosecdef, p.proconfig, p.proacl
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname in ('user_can_access_etab', 'current_user_role');
