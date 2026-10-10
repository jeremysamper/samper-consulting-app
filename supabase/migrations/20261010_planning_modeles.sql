-- ============================================================================
-- Modèles d'horaires du Planning, par établissement
--
-- Quand on touche une case du planning, l'app propose des modèles (Midi, Soir,
-- Coupure, Longue…) qui posent l'horaire en un geste. Rucher et Woodland n'ont
-- pas les mêmes services : chaque établissement règle les siens. Un modèle a
-- un nom et un ou deux créneaux (deux = coupure, midi et soir le même jour).
--
--   segments = [{ "typeShift": "midi", "debut": "10:00", "fin": "15:00", "pause": 0 }, …]
--   typeShift ∈ midi | soir | longue | simple (valeur écrite dans shifts.type_shift)
--
-- Lecture : toute personne de l'établissement. Écriture : qui gère le planning
-- (user_peut_gerer('planning'), même règle que canManageModule côté front et
-- que planning_groupes). Le front écrit par planning_modeles_remplacer, qui
-- remplace la liste d'un bloc (un refus ne laisse jamais une liste à moitié
-- écrite) ; une liste vide fait revenir aux modèles par défaut du front.
--
-- Élargissement pur (expand) : table et fonction neuves, aucune donnée
-- existante touchée. Le front qui la lit reste fonctionnel sans elle (statut
-- 'absent' : modèles par défaut, réglage caché).
-- ============================================================================

create table if not exists public.planning_modeles (
  id               uuid primary key default gen_random_uuid(),
  etablissement_id text not null references public.etablissements(id) on delete cascade,
  nom              text not null,
  segments         jsonb not null,
  ordre            integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint planning_modeles_nom_ck check (length(btrim(nom)) between 1 and 60),
  constraint planning_modeles_segments_ck check (
    jsonb_typeof(segments) = 'array'
    and jsonb_array_length(segments) between 1 and 2
  )
);

create index if not exists planning_modeles_etab_idx
  on public.planning_modeles (etablissement_id);

alter table public.planning_modeles enable row level security;

drop policy if exists planning_modeles_select on public.planning_modeles;
create policy planning_modeles_select on public.planning_modeles
  for select to authenticated
  using (user_can_access_etab(etablissement_id));

drop policy if exists planning_modeles_insert on public.planning_modeles;
create policy planning_modeles_insert on public.planning_modeles
  for insert to authenticated
  with check (
    user_can_access_etab(etablissement_id)
    and user_peut_gerer('planning', array['consultant', 'patron', 'resp_cuisine'])
  );

drop policy if exists planning_modeles_update on public.planning_modeles;
create policy planning_modeles_update on public.planning_modeles
  for update to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and user_peut_gerer('planning', array['consultant', 'patron', 'resp_cuisine'])
  )
  with check (
    user_can_access_etab(etablissement_id)
    and user_peut_gerer('planning', array['consultant', 'patron', 'resp_cuisine'])
  );

drop policy if exists planning_modeles_delete on public.planning_modeles;
create policy planning_modeles_delete on public.planning_modeles
  for delete to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and user_peut_gerer('planning', array['consultant', 'patron', 'resp_cuisine'])
  );

revoke all on public.planning_modeles from anon;
grant select, insert, update, delete on public.planning_modeles to authenticated;

-- Remplace tous les modèles d'un établissement par p_modeles, d'un bloc.
-- SECURITY INVOKER : la RLS ci-dessus s'applique ; le contrôle explicite en
-- tête donne un refus lisible (42501) au lieu d'un effacement sans effet.
create or replace function public.planning_modeles_remplacer(p_etablissement_id text, p_modeles jsonb)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  m jsonb;
  s jsonb;
  i integer := 0;
begin
  if p_etablissement_id is null
     or not user_can_access_etab(p_etablissement_id)
     or not user_peut_gerer('planning', array['consultant', 'patron', 'resp_cuisine']) then
    raise exception 'Réglage des modèles d''horaires refusé' using errcode = '42501';
  end if;
  if p_modeles is null or jsonb_typeof(p_modeles) <> 'array' then
    raise exception 'Liste de modèles invalide' using errcode = '22023';
  end if;
  if jsonb_array_length(p_modeles) > 20 then
    raise exception 'Vingt modèles au plus' using errcode = '22023';
  end if;

  -- Chaque créneau : heures HH:MM, fin après début, pause entière positive.
  for m in select value from jsonb_array_elements(p_modeles) loop
    if jsonb_typeof(m -> 'segments') <> 'array' or jsonb_array_length(m -> 'segments') not between 1 and 2 then
      raise exception 'Un modèle a un ou deux créneaux' using errcode = '22023';
    end if;
    for s in select value from jsonb_array_elements(m -> 'segments') loop
      if coalesce(s ->> 'debut', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
         or coalesce(s ->> 'fin', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
         or (s ->> 'fin') <= (s ->> 'debut')
         or coalesce(s ->> 'typeShift', '') not in ('midi', 'soir', 'longue', 'simple')
         or coalesce(s ->> 'pause', '0') !~ '^[0-9]{1,3}$' then
        raise exception 'Créneau invalide dans « % »', coalesce(m ->> 'nom', '') using errcode = '22023';
      end if;
    end loop;
  end loop;

  delete from public.planning_modeles where etablissement_id = p_etablissement_id;

  for m in select value from jsonb_array_elements(p_modeles) loop
    insert into public.planning_modeles (etablissement_id, nom, segments, ordre)
    values (
      p_etablissement_id,
      btrim(m ->> 'nom'),
      (select jsonb_agg(jsonb_build_object(
          'typeShift', x ->> 'typeShift',
          'debut', x ->> 'debut',
          'fin', x ->> 'fin',
          'pause', coalesce((x ->> 'pause')::integer, 0)))
         from jsonb_array_elements(m -> 'segments') as e(x)),
      i
    );
    i := i + 1;
  end loop;
end;
$function$;

revoke all on function public.planning_modeles_remplacer(text, jsonb) from public, anon;
grant execute on function public.planning_modeles_remplacer(text, jsonb) to authenticated;

-- Realtime : un réglage fait sur un poste se voit sur les autres.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'planning_modeles'
  ) then
    alter publication supabase_realtime add table public.planning_modeles;
  end if;
end $$;

-- Rollback :
--   alter publication supabase_realtime drop table public.planning_modeles;
--   drop function if exists public.planning_modeles_remplacer(text, jsonb);
--   drop table if exists public.planning_modeles;
