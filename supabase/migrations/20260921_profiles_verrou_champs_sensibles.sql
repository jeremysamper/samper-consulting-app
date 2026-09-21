-- ============================================================================
-- profiles : un compte ne peut plus modifier son propre rôle ni son périmètre
--
-- APPLIQUÉ EN PROD via MCP le 21.09.2026, vérifié dans la foulée (auto-promotion
-- refusée 42501, champ anodin accepté, consultant inchangé). Miroir repo == prod.
--
-- CRITIQUE. Trouvé le 21.09.2026 en relisant les fonctions SECURITY DEFINER de
-- l'advisor 0029 : les helpers RLS (current_user_role, current_user_etab_ids,
-- user_can_access_etab) « ne renvoient que des faits sur l'appelant », mais
-- l'appelant pouvait réécrire ces faits.
--
-- Cause : la policy profiles_self_update (UPDATE, TO authenticated) porte
-- USING (id = auth.uid()) sans WITH CHECK, et authenticated a UPDATE sur toutes
-- les colonnes de profiles. La RLS filtre des lignes, jamais des colonnes : un
-- compte pouvait donc écrire role et etablissement_ids sur SA ligne.
--
-- Preuve (harness begin/rollback, en incarnant un cuisinier d'etab-1) :
--   avant  : role cuisinier  · 1 établissement  · 6 profils  · 0 recette etab-2
--   update profiles set role = 'consultant' where id = <lui>            -> 1 ligne
--   update profiles set etablissement_ids = <tous> where id = <lui>     -> 1 ligne
--   après  : role consultant · 6 établissements · 20 profils · 283 recettes etab-2
-- Deux requêtes PATCH /rest/v1/profiles suffisaient. Les 183 policies qui
-- s'appuient sur les helpers, les contrôles de rôle des RPC kds_* et les Edge
-- Functions qui autorisent sur profiles.role (update-user : changement d'email
-- et de mot de passe de n'importe quel compte) suivaient.
-- Aucun signe d'exploitation : les trois profils consultant au 21.09.2026 sont
-- les trois comptes attendus.
--
-- Correctif : trigger BEFORE UPDATE. Hors consultant, une mise à jour qui
-- change id, role, etablissement_ids, actif ou email est refusée (42501). Les
-- autres colonnes (nom, prénom, poste, avatar) restent modifiables par leur
-- propriétaire, et renvoyer une valeur identique passe.
--   · Sans JWT utilisateur (service_role des Edge Functions create-user /
--     update-user, SQL Editor, triggers d'auth) : auth.uid() est null, on passe.
--   · Consultant : inchangé, il gère les comptes depuis Rôles & Accès.
--   · Dans un BEFORE UPDATE, current_user_role() lit encore l'ancienne ligne :
--     impossible de se déclarer consultant dans la requête même qui est jugée.
-- Un trigger plutôt qu'un WITH CHECK ou des privilèges de colonne : les
-- privilèges de colonne s'appliquent au rôle Postgres `authenticated`, que le
-- consultant partage ; le trigger compare OLD et NEW sans piège sur les NULL.
--
-- Front : aucun flux ne touche ces colonnes hors consultant. updateProfile
-- n'est appelé que par Rôles & Accès (src/modules/roles/Roles.jsx et
-- components/roles.jsx), pages réservées au consultant.
--
-- SECURITY INVOKER : la fonction ne lit aucune table, elle n'a rien à
-- contourner. Aucun grant nécessaire pour qu'un trigger se déclenche.
--
-- ROLLBACK :
--   drop trigger if exists trg_profiles_verrou_champs_sensibles on public.profiles;
--   drop function if exists public.profiles_verrou_champs_sensibles();
-- ============================================================================

create or replace function public.profiles_verrou_champs_sensibles()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  -- service_role, SQL Editor, triggers d'auth : pas de JWT utilisateur.
  if auth.uid() is null then
    return new;
  end if;

  if current_user_role() = 'consultant' then
    return new;
  end if;

  if new.id                is distinct from old.id
     or new.role              is distinct from old.role
     or new.etablissement_ids is distinct from old.etablissement_ids
     or new.actif             is distinct from old.actif
     or new.email             is distinct from old.email
  then
    raise exception 'Seul un consultant peut modifier le rôle, les établissements, le statut ou l''email d''un compte'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

revoke all on function public.profiles_verrou_champs_sensibles() from public, anon, authenticated;

drop trigger if exists trg_profiles_verrou_champs_sensibles on public.profiles;
create trigger trg_profiles_verrou_champs_sensibles
  before update on public.profiles
  for each row
  execute function public.profiles_verrou_champs_sensibles();

comment on function public.profiles_verrou_champs_sensibles() is
  'Verrou anti auto-promotion : hors consultant (et hors service_role), refuse toute mise à jour de profiles qui change id, role, etablissement_ids, actif ou email. Ne pas retirer sans remplacer par une garde équivalente : profiles_self_update n''a pas de WITH CHECK.';
