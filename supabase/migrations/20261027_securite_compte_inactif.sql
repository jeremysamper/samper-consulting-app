-- ============================================================================
-- Sécurité L0 : un compte désactivé (profiles.actif = false) perd ses droits
-- en base, sauf le pointage de ses propres horaires
--
-- Constat du 27.10.2026 (relevé L0, point 1) : les trois helpers RLS lisaient
-- profiles sans regarder actif. Un consultant désactivé en juillet lisait
-- encore 1228 recettes, 7 établissements et 25 profils par l'API, et gardait
-- les droits consultant (permissions, établissements, comptes). Seul l'écran
-- (src/hooks/useAuth.js) refusait un profil inactif.
--
-- Changements :
--   1. current_user_role(), user_can_access_etab(text), current_user_etab_ids()
--      ignorent un profil dont actif est false : '', false et '{}'. Un profil
--      à actif NULL reste actif (test « actif is not false », comme pm_insert).
--      Même signature, mêmes attributs, mêmes droits : CREATE OR REPLACE garde
--      l'OID, les policies qui en dépendent ne bougent pas.
--   2. factures_compteurs : la policy lisait profiles en direct ; elle passe
--      par current_user_role() et suit donc la règle.
--   3. private_messages : un compte inactif n'envoie plus de message.
--
-- Ce qui reste ouvert à un compte inactif, et c'est voulu : lire et modifier
-- les champs non sensibles de sa propre ligne de profiles (l'écran doit lire
-- actif pour le déconnecter), lire ses messages, ses réglages et ses lectures
-- d'alertes. Tout ce qui est scopé par établissement ou par rôle est fermé.
-- Reste aussi ouvert : pointer_arrivee, pointer_depart et pointer_offline sur
-- ses propres horaires (SECURITY DEFINER, gardés par user_id = auth.uid()).
-- À fermer avec le bannissement automatique à la désactivation (L7a).
--
-- Effet sur les comptes actifs : aucun (même ligne de profiles lue par clé
-- primaire, une condition de plus). Profils inactifs au 27.10.2026 : 2.
--
-- Idempotent, rejouable.
--
-- ROLLBACK : bloc commenté en pied de fichier, exécutable tel quel une fois
-- décommenté (corps et policies relevés en prod le 27.10.2026). CREATE OR
-- REPLACE garde l'ACL : aucun grant à reposer.
-- ============================================================================

-- ── 1. Helpers ──────────────────────────────────────────────────────────────
create or replace function public.user_can_access_etab(etab_id text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  SELECT COALESCE(
    (SELECT etab_id = ANY(etablissement_ids)
     FROM profiles
     WHERE id = auth.uid()::text AND actif IS NOT FALSE
     LIMIT 1),
    false
  );
$function$;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  SELECT COALESCE(
    (SELECT role FROM profiles
     WHERE id = auth.uid()::text AND actif IS NOT FALSE
     LIMIT 1),
    ''
  );
$function$;

create or replace function public.current_user_etab_ids()
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select coalesce(
    (select etablissement_ids from profiles
      where id = auth.uid()::text and actif is not false
      limit 1),
    array[]::text[]
  );
$function$;

grant execute on function public.user_can_access_etab(text) to authenticated, service_role;
grant execute on function public.current_user_role()        to authenticated, service_role;
grant execute on function public.current_user_etab_ids()    to authenticated, service_role;
revoke execute on function public.user_can_access_etab(text) from anon, public;
revoke execute on function public.current_user_role()        from anon, public;
revoke execute on function public.current_user_etab_ids()    from anon, public;

comment on function public.user_can_access_etab(text) is
  'Helper RLS utilisé par la quasi-totalité des policies. SECURITY DEFINER pour lire profiles sans récursion RLS. Ne répond que sur le périmètre de l''appelant (false pour un établissement étranger, un identifiant inexistant ou un compte désactivé). Advisor 0029 attendu.';
comment on function public.current_user_role() is
  'Helper RLS utilisé par la plupart des policies. SECURITY DEFINER pour lire profiles sans récursion RLS ; authenticated doit garder EXECUTE, les policies s''évaluent sous son rôle. Ne renvoie que le rôle de l''appelant ; chaîne vide sans session, sans profil ou pour un compte désactivé. Advisor 0029 attendu.';
comment on function public.current_user_etab_ids() is
  'Helper RLS (profiles_read). SECURITY DEFINER pour lire profiles sans récursion RLS. Ne renvoie que les établissements de l''appelant ; tableau vide pour un compte désactivé. Advisor 0029 attendu.';

-- ── 2. factures_compteurs ───────────────────────────────────────────────────
-- Avant (27.10.2026), USING et WITH CHECK :
--   EXISTS (SELECT 1 FROM profiles p WHERE p.id = (SELECT auth.uid())::text
--           AND p.role = 'consultant')
drop policy if exists consultants_can_write_compteurs on public.factures_compteurs;
create policy consultants_can_write_compteurs on public.factures_compteurs
  for all to authenticated
  using ((select public.current_user_role()) = 'consultant')
  with check ((select public.current_user_role()) = 'consultant');

-- ── 3. private_messages : l'expéditeur doit être actif ──────────────────────
-- Avant (27.10.2026), WITH CHECK :
--   sender_id = (SELECT auth.uid())::text AND recipient_id <> sender_id
--   AND EXISTS (SELECT 1 FROM profiles r WHERE r.id = private_messages.recipient_id
--               AND r.actif IS NOT FALSE)
drop policy if exists pm_insert on public.private_messages;
create policy pm_insert on public.private_messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())::text
    and recipient_id <> sender_id
    and (select public.current_user_role()) <> ''
    and exists (
      select 1 from public.profiles r
       where r.id = private_messages.recipient_id
         and r.actif is not false
    )
  );

-- ── ROLLBACK A1 (à décommenter) ─────────────────────────────────────────────
-- create or replace function public.user_can_access_etab(etab_id text) returns boolean
-- language sql stable security definer set search_path = public, pg_temp
-- as $function$ SELECT COALESCE((SELECT etab_id = ANY(etablissement_ids) FROM profiles WHERE id = auth.uid()::text LIMIT 1), false); $function$;
-- create or replace function public.current_user_role() returns text
-- language sql stable security definer set search_path = public, pg_temp
-- as $function$ SELECT COALESCE((SELECT role FROM profiles WHERE id = auth.uid()::text LIMIT 1), ''); $function$;
-- create or replace function public.current_user_etab_ids() returns text[]
-- language sql stable security definer set search_path = public, pg_temp
-- as $function$ select coalesce((select etablissement_ids from profiles where id = auth.uid()::text limit 1), array[]::text[]); $function$;
-- alter policy consultants_can_write_compteurs on public.factures_compteurs
--   using (exists (select 1 from profiles p where p.id = (select auth.uid())::text and p.role = 'consultant'))
--   with check (exists (select 1 from profiles p where p.id = (select auth.uid())::text and p.role = 'consultant'));
-- drop policy if exists pm_insert on public.private_messages;
-- create policy pm_insert on public.private_messages for insert to authenticated
--   with check (sender_id = (select auth.uid())::text and recipient_id <> sender_id
--     and exists (select 1 from public.profiles r where r.id = recipient_id and r.actif is not false));
