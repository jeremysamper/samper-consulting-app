-- ─────────────────────────────────────────────────────────────────────────────
-- Inverse de 20261118_reglages_maison_cloture_pointage.sql.
-- Rend pointer_depart et pointer_offline à leur version d'avant (lue en base le
-- 18.11.2026), retire la clôture d'office, son déclencheur et la colonne.
-- Le front lit pointage_fin_auto comme « vrai seulement si true » : la colonne
-- peut partir sans casser un écran. Les fins déjà posées d'office restent
-- (heure de fin prévue), sans drapeau : les relever avant si besoin
--   select id, etablissement_id, date, pointage_debut, pointage_fin
--     from public.shifts where pointage_fin_auto;
-- ─────────────────────────────────────────────────────────────────────────────

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

create or replace function public.pointer_offline(p_shift_id text, p_type text, p_event_at timestamp with time zone, p_client_uuid uuid, p_etablissement_id text default null::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user_id        text := auth.uid()::text;
  v_shift          shifts;
  v_applied        shifts;
  v_zurich         time;
  v_owned          boolean;
  v_etab_client    text;
  v_shift_json     jsonb;
  v_dans_fenetre   boolean;
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
  --    Le geste doit tomber entre la veille et le lendemain du jour du shift,
  --    et pas dans le futur (15 minutes de tolérance d'horloge).
  v_zurich := to_char(p_event_at at time zone 'Europe/Zurich', 'HH24:MI')::time;
  v_dans_fenetre := v_owned
    and p_event_at <= now() + interval '15 minutes'
    and (p_event_at at time zone 'Europe/Zurich')::date
        between v_shift.date::date - 1 and v_shift.date::date + 1;

  if v_dans_fenetre then
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

drop function if exists public.clore_pointages_oublies();
drop trigger if exists trg_shifts_fin_auto on public.shifts;
drop function if exists public.shifts_fin_auto_garde();
alter table public.shifts drop column if exists pointage_fin_auto;
