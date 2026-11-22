-- ─────────────────────────────────────────────────────────────────────────────
-- Inverse de 20261122_bornes_pointage.sql (badgeuse sur borne, lot L6).
--
-- Rend aux quatre RPC de pointage leur corps d'avant (relevé en base le
-- 22.11.2026, md5 de prosrc : pointer_arrivee 693b6384, pointer_depart
-- b5e2ff37, pointer_hors_planning e832a4ab, pointer_offline d10a7f25), puis
-- retire les fonctions, le déclencheur et les tables du lot. Le journal des
-- bornes et les codes personnels sont perdus : les sauvegarder avant s'il le
-- faut. La clé borne_seulement est retirée des réglages.
--
-- Comme la migration, cet inverse réécrit les corps des quatre RPC : à ne pas
-- jouer après une migration ultérieure qui les touche.
--
-- À jouer AVANT de redéployer un front d'avant le lot si la borne est en
-- usage ; un front du lot resté ouvert verra ses appels de borne refusés
-- (fonction absente) sans autre dégât.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- 1. Les quatre RPC de pointage, corps d'avant le lot
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
     set pointage_fin = to_char(now() at time zone 'Europe/Zurich', 'HH24:MI')::time,
         pointage_fin_auto = false
   where s.id = pointer_depart.shift_id
     and s.pointage_debut is not null
     -- Pas encore parti, ou parti seulement par la clôture d'office.
     and (s.pointage_fin is null or s.pointage_fin_auto)
     and (s.user_id = current_user_id or peut_pointer_pour(s.user_id, s.etablissement_id))
  returning * into updated_row;

  if not found then
    raise exception 'Shift introuvable, non autorisé, ou pas arrivé / déjà parti';
  end if;

  return updated_row;
end;
$function$;

create or replace function public.pointer_hors_planning(p_shift_id text, p_etablissement_id text, p_event_at timestamp with time zone DEFAULT now())
 returns shifts
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user_id text := auth.uid()::text;
  v_at      timestamptz := coalesce(p_event_at, now());
  v_jour    date;
  v_heure   time;
  v_row     shifts;
begin
  if v_user_id is null then
    raise exception 'Non authentifié';
  end if;
  if p_shift_id is null or length(p_shift_id) < 8 or p_etablissement_id is null then
    raise exception 'Horaire ou établissement manquant';
  end if;
  if not user_can_access_etab(p_etablissement_id) then
    raise exception 'Établissement non autorisé';
  end if;
  if v_at > now() + interval '5 minutes' or v_at < now() - interval '48 hours' then
    raise exception 'Heure de pointage invalide';
  end if;

  select * into v_row from shifts where id = p_shift_id;
  if found then
    if v_row.user_id <> v_user_id then
      raise exception 'Horaire non autorisé';
    end if;
    return v_row;
  end if;

  v_jour  := (v_at at time zone 'Europe/Zurich')::date;
  v_heure := to_char(v_at at time zone 'Europe/Zurich', 'HH24:MI')::time;

  if exists (
    select 1 from shifts
     where user_id = v_user_id and date = v_jour
       and pointage_debut is not null and pointage_fin is null
  ) then
    raise exception 'Vous êtes déjà en poste : pointez d''abord votre départ';
  end if;

  insert into shifts (id, etablissement_id, user_id, date, debut, fin, pointage_debut, note)
  values (p_shift_id, p_etablissement_id, v_user_id, v_jour, v_heure, v_heure, v_heure, 'Pointage hors planning')
  on conflict (id) do nothing
  returning * into v_row;

  if not found then
    select * into v_row from shifts where id = p_shift_id and user_id = v_user_id;
    if not found then
      raise exception 'Horaire non autorisé';
    end if;
  end if;

  return v_row;
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
      -- Un départ réel rejoué après la clôture d'office la remplace.
      update shifts
         set pointage_fin = v_zurich,
             pointage_fin_auto = false
       where id = p_shift_id
         and pointage_debut is not null
         and (pointage_fin is null or pointage_fin_auto)
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

drop trigger if exists trg_reglages_maison_garde_borne on public.reglages_maison;
drop function if exists public.reglages_maison_garde_borne();

drop function if exists public.pointer_borne(text, text, uuid, timestamptz);
drop function if exists public.borne_etat(text);
drop function if exists public.borne_declarer(text, text);
drop function if exists public.borne_revoquer(uuid);
drop function if exists public.pointage_code_definir(text, text);
drop function if exists public.pointage_code_etat(text);
drop function if exists public.pointage_codes_equipe(text);
drop function if exists public.pointage_code_reinitialiser(text, text);
drop function if exists public.pointage_borne_seulement(text);
drop function if exists public.pointage_empreinte(text);

drop table if exists public.bornes_pointage_essais;
drop table if exists public.pointage_codes_refus;
drop table if exists public.pointage_codes;
drop table if exists public.bornes_pointage;

update public.reglages_maison
   set pointage = pointage - 'borne_seulement'
 where pointage ? 'borne_seulement';

commit;
