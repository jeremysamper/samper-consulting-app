-- ============================================================================
-- I1 — Révocation des privilèges du rôle anon (défense en profondeur)
--
-- STAGED : NE PAS appliquer avant que I2 (d1a9b42) soit posé (ordre du plan).
--
-- L'app est 100 % authentifiée. Le rôle anon (clé publishable embarquée dans le
-- front) ne doit avoir AUCUN accès aux tables ni aux RPC de public ; la RLS
-- redevient une seconde barrière, pas l'unique rempart.
--
-- Pré-check front (grep) = GREEN : aucun écran pré-login ne lit une table/RPC en
-- anon. useAuth ne touche aucune table public avant session ; useTheme = local
-- storage ; module_labels / pos_providers = post-auth ; app_settings/getSetting
-- sans appelant dans src ; loadLegacyModules n'exécute aucune requête au boot ;
-- RPC pointer_* = flux de punch authentifié. Vérif finale : login à froid après
-- application (cache vidé + service worker désinscrit).
--
-- Ne casse pas la RLS : anon perd d'abord l'accès aux tables, donc les fonctions
-- helper (user_can_access_etab, current_user_role, …) ne sont jamais atteintes ;
-- les grants de `authenticated` ne sont pas touchés (punch + RLS intacts).
--
-- ROLLBACK : NE PAS re-grant en masse (réintroduit la faille). Re-grant ciblé
-- uniquement si le runtime prouve un besoin, ex :
--   grant select on public.app_settings to anon;
-- ============================================================================

-- 1) Tables : retirer tous les privilèges de anon
revoke all privileges on all tables in schema public from anon;

-- 2) Séquences : anon ne doit rien incrémenter
revoke all privileges on all sequences in schema public from anon;

-- 3) Fonctions / RPC : retirer EXECUTE de anon
--    (ferme les alertes anon_security_definer_function_executable :
--     pointer_arrivee / pointer_depart / get_brigade_dashboard / …)
revoke all privileges on all functions in schema public from anon;

-- 4) Bloquer toute regrant automatique future vers anon
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

-- 5) Optionnel (barrière la plus stricte) — à n'activer que si le runtime
--    confirme zéro flux anon. Laissé commenté : les revokes ci-dessus suffisent.
-- revoke usage on schema public from anon;

-- ============================================================================
-- Vérification post-application (doivent renvoyer 0 ligne) :
--   select table_name  from information_schema.role_table_grants
--     where grantee='anon' and table_schema='public';
--   select routine_name from information_schema.role_routine_grants
--     where grantee='anon' and routine_schema='public';
-- ============================================================================
