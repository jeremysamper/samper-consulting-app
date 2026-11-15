-- ════════════════════════════════════════════════════════════════════════════
-- Points : verrou du gestionnaire du planning (décision de Jérémy, 15.11.2026,
-- suite du lot P3).
--   1. Un service dont la personne a elle-même posé l'heure de début, la date
--      ou l'attribution (création comprise) ne rapporte pas de point de
--      pointage ; un pointage déjà payé est annulé, une fois.
--   2. « Planifié avant ce jour » (J1) lit l'heure du serveur où le service a
--      pris sa personne et sa date, plus created_at, que l'API peut écrire.
-- Déclencheurs AFTER sur shifts, corps rattrapé en warning : rien ne bloque
-- une écriture du planning ni un pointage. Les services d'avant n'ont pas de
-- suivi : created_at fait foi pour eux, et aucune retouche n'y est connue.
-- Rejouable. Inverse : supabase/migrations-inverse/20261115_points_shifts_retouche.sql
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';

-- ─── Suivi des services, tenu par le serveur ────────────────────────────────
-- Une ligne par service écrit par une personne connectée : l'heure du serveur
-- où il a pris sa personne et sa date (planifie_le), et la première fois où la
-- personne du service a posé elle-même son heure de début, sa date ou son
-- attribution (retouche_par_soi_le, effacée seulement quand un autre lui
-- réattribue le service). Le suivi part avec le service. Aucun accès par l'API :
-- seul le déclencheur écrit, seules les fonctions des points lisent.

create table if not exists public.points_shifts_suivi (
  shift_id text primary key,
  planifie_le timestamptz,
  retouche_par_soi_le timestamptz
);
alter table public.points_shifts_suivi enable row level security;
revoke all on public.points_shifts_suivi from public, anon, authenticated;
comment on table public.points_shifts_suivi is
  'Points : heure serveur où un service a pris sa personne et sa date, et retouche par la personne elle-même (aucun point de pointage). Écrit par points_trg_shifts_suivi seulement.';

create or replace function public.points_trg_shifts_suivi()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_moi text := (select auth.uid())::text;
  v_chg boolean;
  v_place boolean;
  v_soi boolean;
begin
  -- Service supprimé : son suivi part avec lui (un même id réinséré est un
  -- service neuf).
  if tg_op = 'DELETE' then
    delete from public.points_shifts_suivi where shift_id = old.id;
    return null;
  end if;
  -- Écriture sans personne connectée (maintenance, script de données) : rien
  -- à noter, created_at fait foi.
  if v_moi is null then
    return null;
  end if;
  if tg_op = 'INSERT' then
    insert into public.points_shifts_suivi as su (shift_id, planifie_le, retouche_par_soi_le)
    values (new.id, now(), case when new.user_id = v_moi then now() end)
    on conflict (shift_id) do update
      set planifie_le = excluded.planifie_le,
          retouche_par_soi_le = excluded.retouche_par_soi_le;
    return null;
  end if;
  -- UPDATE : la clause WHEN garantit un changement de l'heure de début, de la
  -- date ou de la personne.
  v_chg := new.user_id is distinct from old.user_id;
  v_place := new.date is distinct from old.date or v_chg;
  v_soi := new.user_id = v_moi;
  if not v_place and not v_soi then
    return null;
  end if;
  insert into public.points_shifts_suivi as su (shift_id, planifie_le, retouche_par_soi_le)
  values (new.id, case when v_place then now() end, case when v_soi then now() end)
  on conflict (shift_id) do update
    set planifie_le = coalesce(excluded.planifie_le, su.planifie_le),
        retouche_par_soi_le = case
          when v_soi then coalesce(su.retouche_par_soi_le, excluded.retouche_par_soi_le)
          -- Réattribué par un autre : la nouvelle personne n'a rien posé elle-même.
          when v_chg then null
          else su.retouche_par_soi_le
        end;
  -- Pointage à l'heure déjà payé sur ce service : annulé, une fois.
  if v_soi and exists (select 1 from public.points_mouvements m
                       where m.source_table = 'shifts' and m.source_id = new.id and m.sens = 'credit') then
    perform public.points_annuler('shifts', new.id);
  end if;
  return null;
exception when others then
  -- Rien ne bloque jamais une écriture du planning ni un pointage.
  raise warning 'points_trg_shifts_suivi : %', sqlerrm;
  return null;
end;
$fn$;

revoke execute on function public.points_trg_shifts_suivi() from public, anon, authenticated;

drop trigger if exists trg_points_shifts_suivi_ins on public.shifts;
create trigger trg_points_shifts_suivi_ins
  after insert on public.shifts
  for each row execute function public.points_trg_shifts_suivi();

drop trigger if exists trg_points_shifts_suivi_maj on public.shifts;
create trigger trg_points_shifts_suivi_maj
  after update of debut, date, user_id on public.shifts
  for each row
  when (old.debut is distinct from new.debut or old.date is distinct from new.date
        or old.user_id is distinct from new.user_id)
  execute function public.points_trg_shifts_suivi();

drop trigger if exists trg_points_shifts_suivi_sup on public.shifts;
create trigger trg_points_shifts_suivi_sup
  after delete on public.shifts
  for each row execute function public.points_trg_shifts_suivi();

-- ─── J1 : planifié avant ce jour, heure du serveur ─────────────────────────

create or replace function public.points_programme(p_user text, p_etab text, p_jour date)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
           select 1 from public.shifts s
           left join public.points_shifts_suivi su on su.shift_id = s.id
           where s.etablissement_id = p_etab
             and s.user_id = p_user
             and s.date = p_jour
             and s.debut <> s.fin
             and coalesce(s.note, '') <> 'Pointage hors planning'
             and lower(coalesce(s.statut, '')) not in ('annulé', 'annule', 'refusé', 'refuse')
             -- Planifié avant ce jour : un service créé ou placé ce jour-là (par
             -- exemple par un responsable pour lui-même) ne compte pas. L'heure
             -- vient du serveur (points_shifts_suivi), created_at seulement pour
             -- un service d'avant le suivi ou écrit par la maintenance.
             and coalesce(su.planifie_le, s.created_at, '-infinity'::timestamptz) < (p_jour::timestamp at time zone 'Europe/Zurich')
         )
     and not exists (
           select 1 from public.absences a
           where a.etablissement_id = p_etab
             and a.user_id = p_user
             and p_jour between a.date_debut and a.date_fin
         )
     and not exists (
           select 1 from public.reservation_en_ligne_parametres p
           where p.etablissement_id = p_etab
             and p_jour = any (coalesce(p.jours_fermes, '{}'::date[]))
         )
$fn$;

-- ─── Pointage : rien sur un service retouché par la personne ───────────────

create or replace function public.points_trg_shifts()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_maintenant timestamp := now() at time zone 'Europe/Zurich';
begin
  if tg_op = 'UPDATE' then
    if not exists (select 1 from public.points_reglages r where r.etablissement_id = new.etablissement_id) then
      return null;
    end if;
    if old.pointage_debut is null and new.pointage_debut is not null then
      if not exists (select 1 from public.points_reglages r where r.etablissement_id = new.etablissement_id and r.actif) then
        return null;
      end if;
      -- Un service programmé, pas un pointage hors planning.
      if new.debut = new.fin or coalesce(new.note, '') = 'Pointage hors planning' then
        return null;
      end if;
      -- L'heure de début décalée dans la même écriture : rien.
      if new.debut is distinct from old.debut then
        return null;
      end if;
      -- À l'heure : au plus l'heure de début (le pointage est noté à la minute).
      if new.pointage_debut > new.debut then
        return null;
      end if;
      -- Pas plus d'une heure avant le début (décision de Jérémy, 15.11.2026) :
      -- arriver très en avance ne compte pas « à l'heure ». Calcul en horodatage,
      -- comme le contrôle de l'heure du serveur plus bas.
      if (new.date + new.pointage_debut) < (new.date + new.debut) - interval '60 minutes' then
        return null;
      end if;
      -- Heure du serveur : écrite maintenant, à deux minutes près (la minute
      -- tronquée comprise). Hors ligne synchronisé tard, correction à la main :
      -- rien.
      if abs(extract(epoch from (v_maintenant - (new.date + new.pointage_debut)))) > 180 then
        return null;
      end if;
      -- Service dont la personne a elle-même posé l'heure de début, la date ou
      -- l'attribution (décision de Jérémy, 15.11.2026) : rien.
      if exists (select 1 from public.points_shifts_suivi su
                 where su.shift_id = new.id and su.retouche_par_soi_le is not null) then
        return null;
      end if;
      perform public.points_verser(new.etablissement_id, new.user_id, 'pointage_ponctuel', 'shifts', new.id,
        'pointage:' || new.id);
    elsif old.pointage_debut is not null then
      -- Pointage effacé ou passé en retard : annulation, une fois.
      perform public.points_annuler('shifts', old.id);
    end if;
  elsif tg_op = 'DELETE' then
    if not exists (select 1 from public.points_reglages r where r.etablissement_id = old.etablissement_id) then
      return null;
    end if;
    perform public.points_annuler('shifts', old.id);
  end if;
  return null;
exception when others then
  raise warning 'points_trg_shifts : %', sqlerrm;
  return null;
end;
$fn$;

-- ─── Indicateurs : services du jour sans point de pointage ─────────────────

create or replace function public.points_indicateurs(p_etab text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid text := (select auth.uid())::text;
  r public.points_reglages;
  v_debut timestamptz := date_trunc('day', now() at time zone 'Europe/Zurich') at time zone 'Europe/Zurich';
  v_debut_mois timestamptz := date_trunc('month', now() at time zone 'Europe/Zurich') at time zone 'Europe/Zurich';
  v_suffixe text := ':' || public.points_jour_zurich() || ':' || public.points_moment_zurich(now());
  v_actions jsonb := '{}'::jsonb;
  k text;
  v_pts integer;
  v_plaf integer;
  v_faits integer;
  v_jour integer;
  v_mois integer;
begin
  if v_uid is null or not public.user_can_access_etab(p_etab) then
    return '{}'::jsonb;
  end if;
  select * into r from public.points_reglages where etablissement_id = p_etab and actif;
  if not found or not public.points_participe(v_uid, p_etab, r) then
    return '{}'::jsonb;
  end if;
  select coalesce(sum(m.points) filter (where m.created_at >= v_debut), 0), coalesce(sum(m.points), 0)
    into v_jour, v_mois
  from public.points_mouvements m
  where m.etablissement_id = p_etab and m.user_id = v_uid and m.sens = 'credit' and m.created_at >= v_debut_mois;
  for k in select jsonb_object_keys(public.points_bareme_defaut()) loop
    begin
      select gg.points, gg.plafond into v_pts, v_plaf from public.points_regle(r.bareme, k) gg;
    exception when others then
      v_pts := 0;
      v_plaf := 0;
    end;
    select count(*) into v_faits
    from public.points_mouvements m
    where m.etablissement_id = p_etab and m.user_id = v_uid and m.action = k
      and m.sens = 'credit' and m.created_at >= v_debut;
    v_actions := v_actions || jsonb_build_object(k, jsonb_build_object(
      'points', coalesce(v_pts, 0),
      'plafond', coalesce(v_plaf, 0),
      'faits', v_faits,
      'reste', greatest(coalesce(v_plaf, 0) - v_faits, 0)));
  end loop;
  return jsonb_build_object(
    'actif', true,
    'participant', true,
    'programme_aujourdhui', public.points_programme(v_uid, p_etab, (now() at time zone 'Europe/Zurich')::date),
    'moment', public.points_moment_zurich(now()),
    'actions', v_actions,
    'reste_jour', greatest(coalesce(r.plafond_jour_total, 40) - v_jour, 0),
    'reste_mois', greatest(coalesce(r.plafond_mois_total, 400) - v_mois, 0),
    'zones_payees', coalesce((
      select jsonb_agg(distinct left(m.evenement, length(m.evenement) - length(v_suffixe)))
      from public.points_mouvements m
      where m.etablissement_id = p_etab and m.action = 'releve_haccp' and m.sens = 'credit'
        and m.created_at >= v_debut and right(m.evenement, length(v_suffixe)) = v_suffixe
    ), '[]'::jsonb),
    'perimetres_payes', coalesce((
      select jsonb_agg(distinct lower(btrim(coalesce(i.nom, ''))))
      from public.inventaires i
      join public.points_mouvements m
        on m.etablissement_id = i.etablissement_id
       and m.sens = 'credit'
       and m.created_at >= now() - interval '7 days'
       and ((m.source_table = 'inventaires' and m.source_id = i.id)
            or (m.source_table = 'inventaire_saisies_offline' and left(m.source_id, length(i.id) + 1) = i.id || ':'))
      where i.etablissement_id = p_etab
    ), '[]'::jsonb),
    -- Services du jour dont la personne a posé elle-même l'heure, la date ou
    -- l'attribution : le pointage n'y rapporte rien, pas de pastille.
    'services_sans_pointage', coalesce((
      select jsonb_agg(s.id)
      from public.shifts s
      join public.points_shifts_suivi su on su.shift_id = s.id
      where s.etablissement_id = p_etab and s.user_id = v_uid
        and s.date = (now() at time zone 'Europe/Zurich')::date
        and su.retouche_par_soi_le is not null
    ), '[]'::jsonb)
  );
end;
$fn$;
