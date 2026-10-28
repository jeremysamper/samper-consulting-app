-- ════════════════════════════════════════════════════════════════════════════
-- Réservations : le lien vers un groupe n'est posé que par la base
-- ───────────────────────────────────────────────────────────────────────────
-- Suite de 20261028_groupes_vers_reservations.sql, après revue de sécurité.
--
-- Le trou : la RLS de reservations laisse quiconque peut gérer les
-- Réservations écrire toutes les colonnes de ses lignes, groupe_evenement_id
-- compris. Une réservation de l'établissement A reliée à la main au groupe
-- d'un établissement B aurait reçu, à chaque modification de ce groupe, son
-- nom, son téléphone, son e-mail et sa note d'allergies (la synchronisation
-- est SECURITY DEFINER et cherche la réservation par groupe_evenement_id
-- seul). Elle aurait aussi pris la place unique de la vraie réservation du
-- groupe, et serait partie avec lui à sa suppression. Il fallait connaître
-- l'identifiant (aléatoire) du groupe, mais rien ne l'empêchait.
--
-- La garde, sur reservations, avant insertion ou modification du lien ou de
-- l'établissement :
--   1. un compte de l'API (authenticated, anon) ne pose, ne change ni ne
--      retire jamais groupe_evenement_id : seul le déclencheur de
--      groupe_evenements le fait, depuis sa fonction SECURITY DEFINER
--      (current_user y est le propriétaire, pas authenticated) ;
--   2. pour tout le monde, propriétaire compris, une réservation reliée
--      appartient au même établissement que son groupe.
-- Le front n'écrit aucune de ces deux colonnes sur une réservation existante
-- (ReservationForm, passeport, statuts) : rien ne change pour la salle.
-- Relevé en prod avant application : 0 réservation reliée à un groupe d'un
-- autre établissement.
--
-- Expand pur : une fonction, un déclencheur. Idempotente. Rollback en fin de
-- fichier.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.reservations_garde_lien_groupe()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user in ('authenticated', 'anon')
     and ((tg_op = 'INSERT' and new.groupe_evenement_id is not null)
          or (tg_op = 'UPDATE' and new.groupe_evenement_id is distinct from old.groupe_evenement_id))
  then
    raise exception 'Le lien vers un groupe se pose dans le module Groupes'
      using errcode = '42501';
  end if;

  if new.groupe_evenement_id is not null and not exists (
       select 1 from public.groupe_evenements g
        where g.id = new.groupe_evenement_id
          and g.etablissement_id = new.etablissement_id)
  then
    raise exception 'Réservation et groupe de deux établissements différents'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.reservations_garde_lien_groupe() from public, anon, authenticated;

drop trigger if exists trg_reservations_garde_lien_groupe on public.reservations;
create trigger trg_reservations_garde_lien_groupe
  before insert or update of groupe_evenement_id, etablissement_id on public.reservations
  for each row execute function public.reservations_garde_lien_groupe();

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (à jouer à la main si besoin)
-- ─────────────────────────────────────────────────────────────────────────────
-- drop trigger if exists trg_reservations_garde_lien_groupe on public.reservations;
-- drop function if exists public.reservations_garde_lien_groupe();
