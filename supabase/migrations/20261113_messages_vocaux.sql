-- ============================================================================
-- Messages et contacts, lot C2a : messages vocaux en base (13.11.2026)
--
-- Un vocal est un message privé ordinaire qui cite un fichier audio :
--   private_messages.audio_path    chemin dans le compartiment messages-vocaux,
--                                  "<sender_id>/<uuid>" (extension .m4a ou
--                                  .webm permise, pas exigée)
--   private_messages.audio_duree_s durée en secondes entières, 1 à 120
-- La colonne message reste remplie (« Message vocal ») par le front, pour que
-- les sessions encore ouvertes sur l'ancien front affichent une ligne lisible ;
-- sa contrainte de longueur ne change pas.
--
-- Ce qui ne change pas (K12) : les politiques de private_messages (pm_select,
-- pm_insert, pm_update_read, pm_delete), le droit UPDATE limité à read_at, la
-- publication Realtime (les colonnes neuves y entrent d'elles-mêmes).
--
-- Compartiment messages-vocaux, privé (lecture par URL signée seulement) :
--   types audio/mp4 et audio/webm, sans paramètre de codec ;
--   plafond 3 145 728 octets : 120 s à 192 kbit/s = 2 880 000 octets, plus la
--   marge du conteneur.
-- Politiques sur storage.objects, rôle authenticated seulement :
--   dépôt   : l'expéditeur actif, dans son seul dossier, chemin bien formé ;
--   lecture : l'auteur sur son dossier, ou un participant d'un message qui
--             cite exactement ce chemin (sous la RLS de private_messages) ;
--   retrait : l'auteur sur son dossier.
--   Pas d'UPDATE (ni écrasement ni déplacement), rien pour anon, aucun
--   passe-droit patron ou consultant.
-- Un compte désactivé ne dépose plus rien (current_user_role() vaut '') et
-- garde la lecture de ses conversations, comme pour ses messages écrits
-- (20261027_securite_compte_inactif.sql).
--
-- Fichiers orphelins : un DELETE SQL sur storage.objects est refusé par
-- storage.protect_delete() et ne retirerait pas le fichier (documentation
-- Supabase « Delete Objects »). Le nettoyage passe par la Storage API : le
-- front de l'auteur (remove) après un envoi refusé ou un message supprimé,
-- puis une purge planifiée des résidus (lot à part).
--
-- Additive et rejouable : aucune donnée remplie, rejeu sans effet.
-- À jouer en une seule transaction (les contraintes sont retirées puis
-- reposées) : appliquée en prod par un bloc DO unique qui exécute ce texte.
-- ROLLBACK : 20261113_messages_vocaux.rollback.sql (avant tout front qui lit
-- ces colonnes, compartiment vidé par la Storage API).
-- ============================================================================

-- 1. Colonnes ------------------------------------------------------------------
alter table public.private_messages
  add column if not exists audio_path text,
  add column if not exists audio_duree_s smallint;

-- 2. Contraintes -----------------------------------------------------------------
alter table public.private_messages
  drop constraint if exists private_messages_audio_ensemble;
alter table public.private_messages
  add constraint private_messages_audio_ensemble
  check ((audio_path is null) = (audio_duree_s is null));

alter table public.private_messages
  drop constraint if exists private_messages_audio_duree;
alter table public.private_messages
  add constraint private_messages_audio_duree
  check (audio_duree_s between 1 and 120);

-- Le premier segment est l'expéditeur : un message ne cite qu'un fichier du
-- dossier de son propre expéditeur.
alter table public.private_messages
  drop constraint if exists private_messages_audio_chemin;
alter table public.private_messages
  add constraint private_messages_audio_chemin
  check (
    split_part(audio_path, '/', 1) = sender_id
    and audio_path ~ '^[^/]+/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.(m4a|webm))?$'
  );

-- 3. Index : un fichier n'est cité qu'une fois, et la lecture du compartiment
--    retrouve son message par cet index.
create unique index if not exists private_messages_audio_path_uniq
  on public.private_messages (audio_path)
  where audio_path is not null;

comment on column public.private_messages.audio_path is
  'Vocal : chemin dans le compartiment messages-vocaux, <sender_id>/<uuid>[.m4a|.webm]. NULL pour un message écrit.';
comment on column public.private_messages.audio_duree_s is
  'Vocal : durée en secondes entières, 1 à 120. NULL pour un message écrit.';

-- 4. Compartiment ------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('messages-vocaux', 'messages-vocaux', false, 3145728, array['audio/mp4', 'audio/webm'])
on conflict (id) do nothing;

-- Le rejeu ne réécrit rien ; une dérive (compartiment public, autres types,
-- autre plafond) est refusée ici au lieu d'être recouverte en silence.
do $$
begin
  if not exists (
    select 1 from storage.buckets b
     where b.id = 'messages-vocaux'
       and b.public = false
       and b.file_size_limit = 3145728
       and b.allowed_mime_types @> array['audio/mp4', 'audio/webm']
       and b.allowed_mime_types <@ array['audio/mp4', 'audio/webm']
  ) then
    raise exception 'compartiment messages-vocaux absent, public ou hors gabarit : migration arrêtée';
  end if;
end $$;

-- 5. Politiques sur storage.objects ---------------------------------------------------
drop policy if exists messages_vocaux_insert on storage.objects;
create policy messages_vocaux_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'messages-vocaux'
    and split_part(name, '/', 1) = (select auth.uid())::text
    and name ~ '^[^/]+/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.(m4a|webm))?$'
    and (select public.current_user_role()) <> ''
  );

drop policy if exists messages_vocaux_select on storage.objects;
create policy messages_vocaux_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'messages-vocaux'
    and (
      split_part(name, '/', 1) = (select auth.uid())::text
      or exists (
        select 1 from public.private_messages pm
         where pm.audio_path = objects.name
           and (pm.recipient_id = (select auth.uid())::text
                or pm.sender_id = (select auth.uid())::text)
      )
    )
  );

drop policy if exists messages_vocaux_delete on storage.objects;
create policy messages_vocaux_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'messages-vocaux'
    and split_part(name, '/', 1) = (select auth.uid())::text
  );
