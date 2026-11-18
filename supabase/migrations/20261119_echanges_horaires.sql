-- Échange de services entre employés (lot C2, 19.11.2026).
--
-- Une personne propose un de ses horaires à venir ; un collègue de
-- l'établissement le reprend ; la personne qui gère le planning valide (et
-- l'horaire change de personne) ou refuse. La table ne s'écrit que par les
-- fonctions ci-dessous (aucune policy d'écriture directe), qui portent chacune
-- leur garde :
--   echange_proposer : l'horaire est à soi et à venir, un seul échange ouvert
--                      par horaire ;
--   echange_reprendre : membre de l'établissement, pas le demandeur ;
--   echange_retirer  : le demandeur annule, ou le repreneur se retire ;
--   echange_decider  : user_peut_gerer('planning'), la garde de la mise à jour
--                      des horaires (policy shifts_update).
-- Lecture : tout membre actif de l'établissement.
--
-- Expand seulement : table et fonctions neuves, la table shifts n'est
-- modifiée que par echange_decider, ligne par ligne. Rejouable.
-- Rollback : 20261119_echanges_horaires.rollback.sql.

set local lock_timeout = '5s';

create table if not exists public.echanges_horaires (
  id uuid primary key default gen_random_uuid(),
  etablissement_id text not null references public.etablissements(id) on delete cascade,
  shift_id text not null references public.shifts(id) on delete cascade,
  demandeur text not null,
  repreneur text,
  statut text not null default 'propose' check (statut in ('propose', 'repris', 'valide', 'refuse', 'annule')),
  message text check (message is null or char_length(message) <= 300),
  decide_par text,
  decide_le timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.echanges_horaires is
  'Échanges de services entre employés : proposé, repris par un collègue, validé ou refusé par qui gère le planning. Écriture par les fonctions echange_* seulement.';

create index if not exists echanges_horaires_etab_idx on public.echanges_horaires (etablissement_id, statut);
create index if not exists echanges_horaires_shift_idx on public.echanges_horaires (shift_id);
create unique index if not exists echanges_horaires_un_ouvert_par_horaire
  on public.echanges_horaires (shift_id) where statut in ('propose', 'repris');

alter table public.echanges_horaires enable row level security;
revoke all on table public.echanges_horaires from public, anon, authenticated;
grant select on table public.echanges_horaires to authenticated;

drop policy if exists echanges_horaires_select on public.echanges_horaires;
create policy echanges_horaires_select on public.echanges_horaires
  for select to authenticated
  using (public.user_can_access_etab(etablissement_id));

-- Proposer un de ses horaires à venir.
create or replace function public.echange_proposer(p_shift_id text, p_message text default null)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid text := (select auth.uid())::text;
  v_shift record;
  v_id uuid;
begin
  select id, etablissement_id, user_id, date into v_shift from public.shifts where id = p_shift_id;
  if v_shift.id is null then raise exception 'Horaire introuvable.' using errcode = 'P0002'; end if;
  if v_shift.user_id is distinct from v_uid then raise exception 'Seul votre propre horaire peut être proposé.' using errcode = '42501'; end if;
  if not public.user_can_access_etab(v_shift.etablissement_id) then raise exception 'Accès refusé.' using errcode = '42501'; end if;
  if v_shift.date < (now() at time zone 'Europe/Zurich')::date then raise exception 'Cet horaire est passé.' using errcode = '22023'; end if;
  insert into public.echanges_horaires (etablissement_id, shift_id, demandeur, message)
  values (v_shift.etablissement_id, v_shift.id, v_uid, nullif(btrim(coalesce(p_message, '')), ''))
  returning id into v_id;
  return v_id;
end;
$$;

-- Reprendre l'horaire proposé par un collègue.
create or replace function public.echange_reprendre(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid text := (select auth.uid())::text;
  v_e record;
begin
  select * into v_e from public.echanges_horaires where id = p_id for update;
  if v_e.id is null then raise exception 'Échange introuvable.' using errcode = 'P0002'; end if;
  if not public.user_can_access_etab(v_e.etablissement_id) then raise exception 'Accès refusé.' using errcode = '42501'; end if;
  if v_e.demandeur = v_uid then raise exception 'Vous ne pouvez pas reprendre votre propre horaire.' using errcode = '42501'; end if;
  if v_e.statut <> 'propose' then raise exception 'Cet horaire a déjà été repris.' using errcode = '22023'; end if;
  update public.echanges_horaires set repreneur = v_uid, statut = 'repris', updated_at = now() where id = p_id;
end;
$$;

-- Le demandeur annule ; le repreneur se retire (l'échange redevient proposé).
create or replace function public.echange_retirer(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid text := (select auth.uid())::text;
  v_e record;
begin
  select * into v_e from public.echanges_horaires where id = p_id for update;
  if v_e.id is null then raise exception 'Échange introuvable.' using errcode = 'P0002'; end if;
  if v_e.statut not in ('propose', 'repris') then raise exception 'Cet échange est déjà tranché.' using errcode = '22023'; end if;
  if v_e.demandeur = v_uid then
    update public.echanges_horaires set statut = 'annule', updated_at = now() where id = p_id;
  elsif v_e.repreneur = v_uid then
    update public.echanges_horaires set statut = 'propose', repreneur = null, updated_at = now() where id = p_id;
  else
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
end;
$$;

-- Valider (l'horaire change de personne) ou refuser, par qui gère le planning.
create or replace function public.echange_decider(p_id uuid, p_accepter boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid text := (select auth.uid())::text;
  v_e record;
begin
  select * into v_e from public.echanges_horaires where id = p_id for update;
  if v_e.id is null then raise exception 'Échange introuvable.' using errcode = 'P0002'; end if;
  if not public.user_can_access_etab(v_e.etablissement_id)
     or not public.user_peut_gerer('planning', array['consultant', 'patron', 'resp_cuisine']) then
    raise exception 'Seules les personnes qui gèrent le planning valident un échange.' using errcode = '42501';
  end if;
  if v_e.statut <> 'repris' or v_e.repreneur is null then raise exception 'Cet échange attend encore un collègue.' using errcode = '22023'; end if;
  if p_accepter then
    update public.shifts set user_id = v_e.repreneur, updated_at = now()
     where id = v_e.shift_id and user_id = v_e.demandeur;
    if not found then raise exception 'L''horaire a changé depuis la proposition.' using errcode = '22023'; end if;
  end if;
  update public.echanges_horaires
     set statut = case when p_accepter then 'valide' else 'refuse' end,
         decide_par = v_uid, decide_le = now(), updated_at = now()
   where id = p_id;
end;
$$;

revoke all on function public.echange_proposer(text, text) from public, anon;
revoke all on function public.echange_reprendre(uuid) from public, anon;
revoke all on function public.echange_retirer(uuid) from public, anon;
revoke all on function public.echange_decider(uuid, boolean) from public, anon;
grant execute on function public.echange_proposer(text, text) to authenticated;
grant execute on function public.echange_reprendre(uuid) to authenticated;
grant execute on function public.echange_retirer(uuid) to authenticated;
grant execute on function public.echange_decider(uuid, boolean) to authenticated;
