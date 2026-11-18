-- Recettes : seule la personne qui a créé une fiche peut la supprimer.
-- Le consultant garde la suppression de toutes les fiches de ses établissements
-- (les fiches d'avant cette migration n'ont pas d'auteur connu : le journal
-- d'activité ne montre que des créations par le consultant).
--
-- Expand seulement : colonne ajoutée, aucune colonne lue par le front en ligne
-- n'est touchée. Le front en ligne n'envoie pas created_by, le déclencheur le
-- pose lui-même. Rejouable.

-- 1. Auteur de la fiche (profiles.id, text). NULL = auteur inconnu.
alter table public.recettes add column if not exists created_by text;

comment on column public.recettes.created_by is
  'Auteur de la fiche (profiles.id). Posé par le déclencheur à la création, jamais modifiable par l''API. NULL = fiche créée avant le 18.11.2026 ou par une migration.';

-- 2. Le déclencheur pose l'auteur à la création et le fige ensuite.
-- Hors session (migration, service role : auth.uid() NULL), la valeur fournie
-- est gardée, pour qu'une reprise de données puisse attribuer une fiche.
create or replace function public.recettes_fixer_auteur()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid()::text;
  else
    new.created_by := old.created_by;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_recettes_auteur on public.recettes;
create trigger trg_recettes_auteur
  before insert or update on public.recettes
  for each row execute function public.recettes_fixer_auteur();

-- 3. Suppression : son auteur, ou le consultant, dans un établissement accessible.
drop policy if exists recettes_delete on public.recettes;
create policy recettes_delete on public.recettes
  for delete to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (
      created_by = (select auth.uid())::text
      or (select current_user_role()) = 'consultant'
    )
  );

-- Retour arrière :
-- drop policy if exists recettes_delete on public.recettes;
-- create policy recettes_delete on public.recettes for delete to authenticated
--   using (user_can_access_etab(etablissement_id));
-- drop trigger if exists trg_recettes_auteur on public.recettes;
-- drop function if exists public.recettes_fixer_auteur();
-- (la colonne created_by peut rester, le front d'avant ne la lit pas)
