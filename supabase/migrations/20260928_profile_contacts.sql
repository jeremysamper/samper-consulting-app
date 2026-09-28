-- ============================================================================
-- profile_contacts : numéro de téléphone d'un compte, saisi par lui-même
--
-- Besoin : « Mon compte » (clic sur son nom dans la barre latérale) permet de
-- renseigner son téléphone. Décision produit (28.09.2026) : le numéro n'est
-- visible que par la personne, le patron de ses établissements et le
-- consultant, pas par les collègues.
--
-- Pourquoi une table à part et pas une colonne profiles.tel : la RLS filtre des
-- lignes, jamais des colonnes. profiles_read ouvre la ligne entière aux
-- collègues du même établissement (etablissement_ids && current_user_etab_ids),
-- une colonne y aurait donc été lisible par toute la brigade.
--
-- Clé = profiles.id (TEXT, relation 1-1) : pas de PK uuid, une ligne par
-- compte au plus, supprimée avec le compte.
--
-- Droits :
--   lecture  : soi-même · consultant · patron partageant un établissement
--              avec le compte (le EXISTS sur profiles passe par profiles_read,
--              qui applique déjà ce périmètre)
--   écriture : sa propre ligne uniquement (insert / update / delete)
--
-- Additive : aucune table existante touchée, le front déployé ne la lit pas.
--
-- ROLLBACK :
--   drop table if exists public.profile_contacts;
-- ============================================================================

create table if not exists public.profile_contacts (
  user_id    text primary key references public.profiles(id) on delete cascade,
  tel        text check (tel is null or char_length(tel) between 6 and 32),
  updated_at timestamptz not null default now()
);

comment on table public.profile_contacts is
  'Coordonnées privées d''un compte (téléphone). Lecture : soi-même, consultant, patron d''un établissement commun. Écriture : sa propre ligne. Séparée de profiles car profiles_read ouvre la ligne entière aux collègues.';

alter table public.profile_contacts enable row level security;

revoke all on public.profile_contacts from anon;

drop policy if exists profile_contacts_read on public.profile_contacts;
create policy profile_contacts_read on public.profile_contacts
  for select to authenticated
  using (
    user_id = (select auth.uid())::text
    or (select public.current_user_role()) = 'consultant'
    or (
      (select public.current_user_role()) = 'patron'
      and exists (
        select 1 from public.profiles p
        where p.id = profile_contacts.user_id
          and p.etablissement_ids && (select public.current_user_etab_ids())
      )
    )
  );

drop policy if exists profile_contacts_insert_own on public.profile_contacts;
create policy profile_contacts_insert_own on public.profile_contacts
  for insert to authenticated
  with check (user_id = (select auth.uid())::text);

drop policy if exists profile_contacts_update_own on public.profile_contacts;
create policy profile_contacts_update_own on public.profile_contacts
  for update to authenticated
  using (user_id = (select auth.uid())::text)
  with check (user_id = (select auth.uid())::text);

drop policy if exists profile_contacts_delete_own on public.profile_contacts;
create policy profile_contacts_delete_own on public.profile_contacts
  for delete to authenticated
  using (user_id = (select auth.uid())::text);
