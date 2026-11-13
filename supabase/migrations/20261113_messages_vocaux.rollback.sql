-- ============================================================================
-- ROLLBACK de 20261113_messages_vocaux.sql (lot C2a, messages vocaux)
--
-- À jouer seulement tant qu'aucun front déployé ne lit audio_path ni
-- audio_duree_s (expand/contract : retirer d'abord le front de C3).
--
-- Avant ce fichier : vider puis supprimer le compartiment messages-vocaux par
-- la Storage API (tableau de bord Supabase, Storage, ou remove() puis
-- deleteBucket() en service_role). Un DELETE SQL sur storage.objects ou
-- storage.buckets est refusé par storage.protect_delete() et, forcé, laisserait
-- les fichiers facturés sans métadonnée.
--
-- Les politiques passent avant les colonnes : messages_vocaux_select lit
-- private_messages.audio_path.
-- ============================================================================

-- Garde : supprimer audio_path effacerait la seule trace des fichiers cités.
-- Requête dynamique : le fichier reste rejouable une fois la colonne partie.
do $$
declare
  vocaux boolean := false;
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'private_messages' and column_name = 'audio_path'
  ) then
    execute 'select exists (select 1 from public.private_messages where audio_path is not null)' into vocaux;
  end if;
  if vocaux then
    raise exception 'rollback refusé : des messages vocaux existent encore (vider le compartiment par la Storage API, puis supprimer ces lignes)';
  end if;
end $$;

drop policy if exists messages_vocaux_insert on storage.objects;
drop policy if exists messages_vocaux_select on storage.objects;
drop policy if exists messages_vocaux_delete on storage.objects;

drop index if exists public.private_messages_audio_path_uniq;

alter table public.private_messages
  drop constraint if exists private_messages_audio_chemin,
  drop constraint if exists private_messages_audio_duree,
  drop constraint if exists private_messages_audio_ensemble;

alter table public.private_messages
  drop column if exists audio_duree_s,
  drop column if exists audio_path;
