-- ============================================================================
-- Groupes du Planning & Pointage, et comptes de pointage partagés
--
-- 1. Groupes : chaque établissement a un groupe Salle et un groupe Cuisine
--    (famille 'salle' / 'cuisine'), et peut en ajouter d'autres (Plonge,
--    Réception…). Une personne appartient à un seul groupe par établissement.
--    Sans affectation explicite, elle tombe dans le groupe de son rôle :
--    serveur et hote en Salle, cuisinier et resp_cuisine en Cuisine, les
--    autres « Sans groupe ». Changer quelqu'un de groupe = une ligne dans
--    planning_groupe_membres.
--
-- 2. Comptes de pointage partagés (pointage_postes) : un compte d'appareil
--    (ex. « Woodland Service », « Woodland Cuisine » sur l'iPad du
--    restaurant) est rattaché à un ou plusieurs groupes. Depuis ce compte, on
--    pointe l'arrivée et le départ des membres de ces groupes. Chacun garde le
--    pointage sur son propre compte : l'horaire pointé reste le sien.
--
-- 3. Pointage : pointer_arrivee, pointer_depart et pointer_offline acceptent
--    désormais, en plus du propriétaire de l'horaire :
--      * un compte de pointage partagé rattaché au groupe de la personne ;
--      * une personne qui gère le planning (user_peut_gerer('planning'), même
--        règle que canManageModule côté front). Le front affichait déjà les
--        boutons de pointage aux managers, que la base refusait.
--    Heure toujours posée par le serveur (Zurich), mêmes gardes anti-double.
--
-- Droits d'écriture (dérivés pour le front, voir usePlanningGroupes.js) :
--   * groupes et affectations : qui gère le planning (consultant, patron,
--     resp_cuisine par défaut, réglable dans Rôles & accès) ;
--   * comptes de pointage partagés : consultant et patron seulement (ils
--     donnent le droit de pointer pour d'autres).
--
-- Élargissement pur (expand) : trois tables neuves, deux fonctions internes
-- neuves, trois fonctions de pointage dont la garde s'élargit (signatures,
-- retours et messages inchangés). Le front déployé ne lit pas les tables ; le
-- front qui les lit reste fonctionnel sans elles (statut 'absent', rien
-- d'affiché en plus).
-- Idempotente. Rollback en fin de fichier.
-- ============================================================================

-- ─── Tables ─────────────────────────────────────────────────────────────────

create table if not exists public.planning_groupes (
  id               uuid        primary key default gen_random_uuid(),
  etablissement_id text        not null references public.etablissements(id) on delete cascade,
  nom              text        not null check (char_length(btrim(nom)) between 1 and 40),
  famille          text        check (famille in ('salle', 'cuisine')),
  ordre            integer     not null default 0,
  created_at       timestamptz not null default now(),
  -- Cible des clés étrangères composites : un membre ou un poste ne peut
  -- pointer que vers un groupe du même établissement.
  unique (id, etablissement_id)
);

create unique index if not exists planning_groupes_famille_uniq
  on public.planning_groupes (etablissement_id, famille) where famille is not null;
create unique index if not exists planning_groupes_nom_uniq
  on public.planning_groupes (etablissement_id, lower(btrim(nom)));

create table if not exists public.planning_groupe_membres (
  etablissement_id text        not null,
  user_id          text        not null references public.profiles(id) on delete cascade,
  groupe_id        uuid        not null,
  updated_at       timestamptz not null default now(),
  primary key (etablissement_id, user_id),
  foreign key (groupe_id, etablissement_id)
    references public.planning_groupes (id, etablissement_id) on delete cascade
);
create index if not exists planning_groupe_membres_groupe_idx
  on public.planning_groupe_membres (groupe_id);

create table if not exists public.pointage_postes (
  etablissement_id text        not null,
  user_id          text        not null references public.profiles(id) on delete cascade,
  groupe_id        uuid        not null,
  created_at       timestamptz not null default now(),
  primary key (user_id, groupe_id),
  foreign key (groupe_id, etablissement_id)
    references public.planning_groupes (id, etablissement_id) on delete cascade
);
create index if not exists pointage_postes_etab_idx  on public.pointage_postes (etablissement_id);
create index if not exists pointage_postes_groupe_idx on public.pointage_postes (groupe_id);

-- ─── Groupes Salle et Cuisine de chaque établissement ──────────────────────

insert into public.planning_groupes (etablissement_id, nom, famille, ordre)
select e.id, v.nom, v.famille, v.ordre
  from public.etablissements e
 cross join (values ('Salle', 'salle', 1), ('Cuisine', 'cuisine', 2)) as v(nom, famille, ordre)
on conflict do nothing;

create or replace function public.planning_groupes_par_defaut()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  insert into planning_groupes (etablissement_id, nom, famille, ordre)
  values (new.id, 'Salle', 'salle', 1), (new.id, 'Cuisine', 'cuisine', 2)
  on conflict do nothing;
  return new;
end;
$function$;
revoke all on function public.planning_groupes_par_defaut() from public, anon, authenticated;

drop trigger if exists etablissements_planning_groupes on public.etablissements;
create trigger etablissements_planning_groupes
  after insert on public.etablissements
  for each row execute function public.planning_groupes_par_defaut();

-- ─── Fonctions internes ─────────────────────────────────────────────────────

-- Groupe d'une personne dans un établissement : son affectation, sinon le
-- groupe de la famille de son rôle. Même règle que groupeDe() côté front.
create or replace function public.planning_groupe_de(p_user_id text, p_etab text)
returns uuid
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(
    (select m.groupe_id
       from planning_groupe_membres m
      where m.etablissement_id = p_etab and m.user_id = p_user_id),
    (select g.id
       from planning_groupes g
       join profiles p on p.id = p_user_id
      where g.etablissement_id = p_etab
        and g.famille = case
              when p.role in ('serveur', 'hote') then 'salle'
              when p.role in ('cuisinier', 'resp_cuisine') then 'cuisine'
            end)
  );
$function$;

-- L'appelant peut-il pointer l'horaire de p_user_id dans p_etab ?
-- Lui-même : toujours (comportement historique, sans contrôle d'établissement).
-- Sinon : membre de l'établissement ET (gère le planning OU compte de pointage
-- partagé rattaché au groupe de la personne).
create or replace function public.peut_pointer_pour(p_user_id text, p_etab text)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select case
    when auth.uid() is null or p_user_id is null then false
    when p_user_id = auth.uid()::text then true
    when p_etab is null or not user_can_access_etab(p_etab) then false
    when user_peut_gerer('planning', array['consultant', 'patron', 'resp_cuisine']) then true
    else exists (
      select 1
        from pointage_postes pp
       where pp.user_id = auth.uid()::text
         and pp.etablissement_id = p_etab
         and pp.groupe_id = planning_groupe_de(p_user_id, p_etab)
    )
  end;
$function$;

-- Appelées seulement depuis les fonctions de pointage (SECURITY DEFINER).
revoke all on function public.planning_groupe_de(text, text) from public, anon, authenticated;
revoke all on function public.peut_pointer_pour(text, text) from public, anon, authenticated;

-- ─── Pointage : garde élargie ───────────────────────────────────────────────

create or replace function public.pointer_arrivee(shift_id text)
returns shifts
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  current_user_id text := auth.uid()::text;
  updated_row shifts;
begin
  update shifts s
     set pointage_debut = to_char(now() at time zone 'Europe/Zurich', 'HH24:MI')::time
   where s.id = pointer_arrivee.shift_id
     and s.pointage_debut is null
     and (s.user_id = current_user_id or peut_pointer_pour(s.user_id, s.etablissement_id))
  returning * into updated_row;

  if not found then
    raise exception 'Shift introuvable, non autorisé, ou déjà pointé';
  end if;

  return updated_row;
end;
$function$;

create or replace function public.pointer_depart(shift_id text)
returns shifts
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  current_user_id text := auth.uid()::text;
  updated_row shifts;
begin
  update shifts s
     set pointage_fin = to_char(now() at time zone 'Europe/Zurich', 'HH24:MI')::time
   where s.id = pointer_depart.shift_id
     and s.pointage_debut is not null
     and s.pointage_fin is null
     and (s.user_id = current_user_id or peut_pointer_pour(s.user_id, s.etablissement_id))
  returning * into updated_row;

  if not found then
    raise exception 'Shift introuvable, non autorisé, ou pas arrivé / déjà parti';
  end if;

  return updated_row;
end;
$function$;

create or replace function public.pointer_offline(
  p_shift_id text,
  p_type text,
  p_event_at timestamp with time zone,
  p_client_uuid uuid,
  p_etablissement_id text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user_id     text := auth.uid()::text;
  v_shift       shifts;
  v_applied     shifts;
  v_zurich      time;
  v_owned       boolean;
  v_etab_client text;
  v_shift_json  jsonb;
begin
  if v_user_id is null then
    raise exception 'Non authentifié';
  end if;

  if p_client_uuid is null or p_event_at is null then
    raise exception 'client_uuid et event_at sont requis';
  end if;

  if p_type not in ('arrivee', 'depart') then
    raise exception 'Type de pointage invalide : %', p_type;
  end if;

  select * into v_shift from shifts where id = p_shift_id;

  -- Rien de ce shift ne sort de la fonction si l'appelant ne peut pas le
  -- pointer (propriétaire, manager du planning, compte de pointage partagé).
  v_owned := coalesce(
    v_shift.user_id = v_user_id or peut_pointer_pour(v_shift.user_id, v_shift.etablissement_id),
    false);
  v_shift_json := case when v_owned then to_jsonb(v_shift) else null end;

  -- L'établissement annoncé par l'appareil n'est retenu que s'il est dans le
  -- périmètre de l'appelant.
  v_etab_client := case
    when p_etablissement_id is not null and user_can_access_etab(p_etablissement_id)
      then p_etablissement_id
    else null
  end;

  -- 1. Journal d'abord : la PK client_uuid porte l'idempotence. Un rejeu déjà
  --    passé ressort en 'duplicate' (succès idempotent, pas une erreur).
  --    user_id = l'appelant (le compte qui a pointé).
  insert into pointages_offline
    (client_uuid, shift_id, user_id, etablissement_id, type_pointage, event_at)
  values
    (p_client_uuid, p_shift_id, v_user_id,
     case when v_owned then coalesce(v_shift.etablissement_id, v_etab_client)
          else v_etab_client end,
     p_type, p_event_at)
  on conflict (client_uuid) do nothing;

  if not found then
    return jsonb_build_object('status', 'duplicate', 'shift', v_shift_json);
  end if;

  -- 2. Application au shift : heure du geste convertie en heure Zurich, mêmes
  --    gardes que les RPC online. Best-effort : aucune exception à ce stade.
  v_zurich := to_char(p_event_at at time zone 'Europe/Zurich', 'HH24:MI')::time;

  if v_owned then
    if p_type = 'arrivee' then
      update shifts
         set pointage_debut = v_zurich
       where id = p_shift_id
         and pointage_debut is null
      returning * into v_applied;
    else
      update shifts
         set pointage_fin = v_zurich
       where id = p_shift_id
         and pointage_debut is not null
         and pointage_fin is null
      returning * into v_applied;
    end if;

    if found then
      update pointages_offline set applied = true where client_uuid = p_client_uuid;
      return jsonb_build_object('status', 'applied', 'shift', to_jsonb(v_applied));
    end if;
  end if;

  return jsonb_build_object('status', 'not_applied', 'shift', v_shift_json);
end;
$function$;

-- create or replace garde les droits existants ; on les repose quand même
-- (authentifiés seulement), au cas où la fonction n'existait pas.
revoke all on function public.pointer_arrivee(text) from public, anon;
revoke all on function public.pointer_depart(text) from public, anon;
revoke all on function public.pointer_offline(text, text, timestamptz, uuid, text) from public, anon;
grant execute on function public.pointer_arrivee(text) to authenticated;
grant execute on function public.pointer_depart(text) to authenticated;
grant execute on function public.pointer_offline(text, text, timestamptz, uuid, text) to authenticated;

-- ─── RLS ────────────────────────────────────────────────────────────────────

alter table public.planning_groupes        enable row level security;
alter table public.planning_groupe_membres enable row level security;
alter table public.pointage_postes         enable row level security;

revoke all on public.planning_groupes        from anon;
revoke all on public.planning_groupe_membres from anon;
revoke all on public.pointage_postes         from anon;
grant select, insert, update, delete on public.planning_groupes        to authenticated;
grant select, insert, update, delete on public.planning_groupe_membres to authenticated;
grant select, insert, delete         on public.pointage_postes         to authenticated;

-- Groupes : lecture pour l'établissement ; écriture pour qui gère le planning.
-- Salle et Cuisine (famille posée) se renomment mais ne se suppriment pas.
drop policy if exists planning_groupes_select on public.planning_groupes;
create policy planning_groupes_select on public.planning_groupes
  for select to authenticated
  using (user_can_access_etab(etablissement_id));

drop policy if exists planning_groupes_insert on public.planning_groupes;
create policy planning_groupes_insert on public.planning_groupes
  for insert to authenticated
  with check (
    user_can_access_etab(etablissement_id)
    and user_peut_gerer('planning', array['consultant', 'patron', 'resp_cuisine'])
    and famille is null
  );

drop policy if exists planning_groupes_update on public.planning_groupes;
create policy planning_groupes_update on public.planning_groupes
  for update to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and user_peut_gerer('planning', array['consultant', 'patron', 'resp_cuisine'])
  )
  with check (
    user_can_access_etab(etablissement_id)
    and user_peut_gerer('planning', array['consultant', 'patron', 'resp_cuisine'])
  );

drop policy if exists planning_groupes_delete on public.planning_groupes;
create policy planning_groupes_delete on public.planning_groupes
  for delete to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and user_peut_gerer('planning', array['consultant', 'patron', 'resp_cuisine'])
    and famille is null
  );

-- La famille d'un groupe ne change pas (Salle reste Salle, un groupe ajouté
-- ne devient pas Salle) : la policy UPDATE ne voit pas l'ancienne valeur.
create or replace function public.planning_groupes_famille_fixe()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.famille is distinct from old.famille or new.etablissement_id <> old.etablissement_id then
    raise exception 'La famille et l''établissement d''un groupe ne se modifient pas';
  end if;
  return new;
end;
$function$;
revoke all on function public.planning_groupes_famille_fixe() from public, anon, authenticated;

drop trigger if exists planning_groupes_famille_fixe on public.planning_groupes;
create trigger planning_groupes_famille_fixe
  before update on public.planning_groupes
  for each row execute function public.planning_groupes_famille_fixe();

-- Affectations : mêmes droits que les groupes ; seulement une personne
-- rattachée à l'établissement.
drop policy if exists planning_groupe_membres_select on public.planning_groupe_membres;
create policy planning_groupe_membres_select on public.planning_groupe_membres
  for select to authenticated
  using (user_can_access_etab(etablissement_id));

drop policy if exists planning_groupe_membres_insert on public.planning_groupe_membres;
create policy planning_groupe_membres_insert on public.planning_groupe_membres
  for insert to authenticated
  with check (
    user_can_access_etab(etablissement_id)
    and user_peut_gerer('planning', array['consultant', 'patron', 'resp_cuisine'])
    and exists (
      select 1 from public.profiles p
       where p.id = planning_groupe_membres.user_id
         and planning_groupe_membres.etablissement_id = any(p.etablissement_ids)
    )
  );

drop policy if exists planning_groupe_membres_update on public.planning_groupe_membres;
create policy planning_groupe_membres_update on public.planning_groupe_membres
  for update to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and user_peut_gerer('planning', array['consultant', 'patron', 'resp_cuisine'])
  )
  with check (
    user_can_access_etab(etablissement_id)
    and user_peut_gerer('planning', array['consultant', 'patron', 'resp_cuisine'])
    and exists (
      select 1 from public.profiles p
       where p.id = planning_groupe_membres.user_id
         and planning_groupe_membres.etablissement_id = any(p.etablissement_ids)
    )
  );

drop policy if exists planning_groupe_membres_delete on public.planning_groupe_membres;
create policy planning_groupe_membres_delete on public.planning_groupe_membres
  for delete to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and user_peut_gerer('planning', array['consultant', 'patron', 'resp_cuisine'])
  );

-- Comptes de pointage partagés : consultant et patron, compte rattaché à
-- l'établissement. Pas de policy UPDATE : on ajoute ou on retire une ligne.
drop policy if exists pointage_postes_select on public.pointage_postes;
create policy pointage_postes_select on public.pointage_postes
  for select to authenticated
  using (user_can_access_etab(etablissement_id));

drop policy if exists pointage_postes_insert on public.pointage_postes;
create policy pointage_postes_insert on public.pointage_postes
  for insert to authenticated
  with check (
    user_can_access_etab(etablissement_id)
    and (select current_user_role()) = any(array['consultant', 'patron'])
    and exists (
      select 1 from public.profiles p
       where p.id = pointage_postes.user_id
         and pointage_postes.etablissement_id = any(p.etablissement_ids)
    )
  );

drop policy if exists pointage_postes_delete on public.pointage_postes;
create policy pointage_postes_delete on public.pointage_postes
  for delete to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select current_user_role()) = any(array['consultant', 'patron'])
  );

-- ─── Realtime ───────────────────────────────────────────────────────────────

do $$
declare
  t text;
begin
  foreach t in array array['planning_groupes', 'planning_groupe_membres', 'pointage_postes'] loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK :
--
-- 1. Remettre les trois fonctions de pointage à leur garde d'origine
--    (user_id = auth.uid()::text seul) : corps d'origine dans
--    20260712_pointage_offline_idempotence.sql (pointer_offline) et ci-dessous.
--
--   create or replace function public.pointer_arrivee(shift_id text) returns shifts
--   language plpgsql security definer set search_path to 'public', 'pg_temp' as $f$
--   declare current_user_id text := auth.uid()::text; updated_row shifts;
--   begin
--     update shifts set pointage_debut = to_char(now() at time zone 'Europe/Zurich', 'HH24:MI')::time
--      where id = shift_id and user_id = current_user_id and pointage_debut is null
--     returning * into updated_row;
--     if not found then raise exception 'Shift introuvable, non autorisé, ou déjà pointé'; end if;
--     return updated_row;
--   end; $f$;
--
--   create or replace function public.pointer_depart(shift_id text) returns shifts
--   language plpgsql security definer set search_path to 'public', 'pg_temp' as $f$
--   declare current_user_id text := auth.uid()::text; updated_row shifts;
--   begin
--     update shifts set pointage_fin = to_char(now() at time zone 'Europe/Zurich', 'HH24:MI')::time
--      where id = shift_id and user_id = current_user_id
--        and pointage_debut is not null and pointage_fin is null
--     returning * into updated_row;
--     if not found then raise exception 'Shift introuvable, non autorisé, ou pas arrivé / déjà parti'; end if;
--     return updated_row;
--   end; $f$;
--
-- 2. Puis :
--   drop trigger if exists etablissements_planning_groupes on public.etablissements;
--   drop table if exists public.pointage_postes;
--   drop table if exists public.planning_groupe_membres;
--   drop table if exists public.planning_groupes;
--   drop function if exists public.peut_pointer_pour(text, text);
--   drop function if exists public.planning_groupe_de(text, text);
--   drop function if exists public.planning_groupes_par_defaut();
--   drop function if exists public.planning_groupes_famille_fixe();
-- ─────────────────────────────────────────────────────────────────────────────
