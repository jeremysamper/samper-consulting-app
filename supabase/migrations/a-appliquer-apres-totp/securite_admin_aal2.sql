-- ============================================================================
-- Sécurité L0 (S4) : les écritures d'administration exigent une session aal2
--
-- À APPLIQUER SEULEMENT après la confirmation écrite de Jérémy que chaque
-- consultant actif a inscrit son facteur TOTP et se connecte avec. Avant cela,
-- cette migration couperait l'administration (Rôles & accès, Paramètres).
--
-- NON APPLIQUÉE (27.10.2026). Essai à blanc fait ce jour sur la prod : en aal1,
-- le consultant n'écrit plus permissions (5 → 0 lignes), droits par personne
-- (17 → 0), établissements (7 → 0), profils (24 → 0) et ne change plus ses
-- propres établissements (refus 42501) ; en aal2, tout reste identique ; les
-- lectures ne bougent pas. Au moment de l'appliquer : déplacer le fichier à la
-- racine de migrations/ sous le nom AAAAMMJJ_securite_admin_aal2.sql, refaire
-- l'essai à blanc et la revue SQL, et ajouter dans le même lot le refus sans
-- aal2 dans create-user, update-user et delete-user.
--
-- Constat du 27.10.2026 (relevé L0, point 2) : 0 facteur vérifié sur 25
-- profils, 46 sessions aal1. Un mot de passe consultant volé suffisait pour
-- changer les droits de tous les clients, les établissements et les comptes.
--
-- Écritures d'administration visées (policies ALL du consultant) :
--   permissions (perms_write), permissions_utilisateurs
--   (permissions_utilisateurs_write), etablissements (etabs_write),
--   app_settings (settings_write), profiles (profiles_consultant_all).
-- Les lectures ne changent pas : chacune de ces tables a sa policy SELECT à
-- part (perms_read, settings_read, etabs_read, profiles_read, et la lecture de
-- permissions_utilisateurs), qui ne demande pas aal2.
-- Le verrou de profiles ne laisse passer un consultant que s'il est en aal2 :
-- sinon un consultant en aal1 changerait ses propres établissements par
-- profiles_self_update.
--
-- Les Edge Functions d'administration (create-user, update-user, delete-user)
-- vérifient aal2 de leur côté, dans le même lot (service_role ne passe pas
-- par ces policies).
--
-- Idempotent, rejouable.
--
-- ROLLBACK : recréer les cinq policies sans la condition aal2 (texte d'origine
-- en commentaire au-dessus de chacune) et le verrou de
-- 20260921_profiles_verrou_champs_sensibles.sql.
-- ============================================================================

-- Avant : using / with check (current_user_role() = 'consultant')
drop policy if exists perms_write on public.permissions;
create policy perms_write on public.permissions
  for all to authenticated
  using ((select public.current_user_role()) = 'consultant'
         and coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2')
  with check ((select public.current_user_role()) = 'consultant'
              and coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2');

-- Avant : using / with check ((select current_user_role()) = 'consultant')
drop policy if exists permissions_utilisateurs_write on public.permissions_utilisateurs;
create policy permissions_utilisateurs_write on public.permissions_utilisateurs
  for all to authenticated
  using ((select public.current_user_role()) = 'consultant'
         and coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2')
  with check ((select public.current_user_role()) = 'consultant'
              and coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2');

-- Avant : using / with check (current_user_role() = 'consultant')
drop policy if exists etabs_write on public.etablissements;
create policy etabs_write on public.etablissements
  for all to authenticated
  using ((select public.current_user_role()) = 'consultant'
         and coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2')
  with check ((select public.current_user_role()) = 'consultant'
              and coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2');

-- Avant : using / with check (current_user_role() = 'consultant')
drop policy if exists settings_write on public.app_settings;
create policy settings_write on public.app_settings
  for all to authenticated
  using ((select public.current_user_role()) = 'consultant'
         and coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2')
  with check ((select public.current_user_role()) = 'consultant'
              and coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2');

-- Avant : using / with check (current_user_role() = 'consultant')
drop policy if exists profiles_consultant_all on public.profiles;
create policy profiles_consultant_all on public.profiles
  for all to authenticated
  using ((select public.current_user_role()) = 'consultant'
         and coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2')
  with check ((select public.current_user_role()) = 'consultant'
              and coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2');

-- Verrou de profiles : même corps que 20260921, le passe-droit consultant
-- demande aal2.
create or replace function public.profiles_verrou_champs_sensibles()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  -- service_role, SQL Editor, triggers d'auth : pas de JWT utilisateur.
  if auth.uid() is null then
    return new;
  end if;

  if current_user_role() = 'consultant'
     and coalesce(auth.jwt() ->> 'aal', '') = 'aal2' then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.role is distinct from old.role
     or new.etablissement_ids is distinct from old.etablissement_ids
     or new.actif is distinct from old.actif
     or new.email is distinct from old.email then
    raise exception 'Seul un consultant, en double authentification, peut modifier le rôle, les établissements, le statut ou l''email d''un compte'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;
