-- ─────────────────────────────────────────────────────────────────────────────
-- Clôture d'office des pointages oubliés (18.11.2026), dernier lot des
-- réglages de la maison. À appliquer APRÈS 20261118_reglages_maison.sql
-- (la fonction de clôture lit reglages_maison).
--
--   shifts.pointage_fin_auto   vrai quand le départ a été posé par la clôture
--                              d'office, et non par un pointage ou une
--                              correction. Le planning l'affiche « Départ non
--                              pointé, clos d'office ».
--   trg_shifts_fin_auto        déclencheur BEFORE : seule la clôture pose le
--                              drapeau ; toute autre écriture de pointage_fin
--                              (pointage réel, file hors ligne, correction,
--                              réinitialisation) le remet à false, et personne
--                              ne le pose à la main.
--   clore_pointages_oublies()  pour chaque établissement dont
--                              reglages_maison.pointage->'cloture_auto_h' vaut
--                              un entier de 8 à 16 : sur les horaires arrivés
--                              depuis plus de X h (heure de Zurich), dont la
--                              fin prévue est passée et sans départ, pose
--                              pointage_fin = fin prévue (début + X h quand la
--                              fin prévue ne tombe pas après l'arrivée) et
--                              pointage_fin_auto = true. service_role seul :
--                              appelée au passage horaire de alerts-evaluator.
--                              Bornée aux trois derniers jours : un réglage
--                              activé ne réécrit pas les mois déjà exportés.
--   pointer_depart, pointer_offline
--                              un départ réel, y compris rejoué plus tard par
--                              la file hors ligne, écrase une fin posée
--                              d'office. Heure toujours prise sur le serveur
--                              (en ligne) ou au geste (hors ligne), jamais sur
--                              un réglage du client. Signatures inchangées :
--                              create or replace remplace sans surcharge.
--
-- Ajout seul (expand) : une colonne avec défaut, un déclencheur, une fonction ;
-- les deux RPC gardent leur signature et leur retour. Le front déployé lit
-- shifts par select * et ignore la colonne. Aucun établissement n'a de
-- cloture_auto_h tant que personne ne le règle : rien ne se clôt avant.
-- Idempotente. Inverse : 20261118_reglages_maison_cloture_pointage.rollback.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Colonne ------------------------------------------------------------------
alter table public.shifts
  add column if not exists pointage_fin_auto boolean not null default false;

comment on column public.shifts.pointage_fin_auto is
  'Vrai quand pointage_fin a été posé par clore_pointages_oublies (départ non pointé, clos d''office). Remis à false par toute autre écriture de pointage_fin (trg_shifts_fin_auto).';

-- 2. Garde du drapeau ----------------------------------------------------------
create or replace function public.shifts_fin_auto_garde()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- La clôture d'office pose elle-même le drapeau : réglage local à sa
  -- transaction, posé et retiré par clore_pointages_oublies.
  if current_setting('app.cloture_pointages', true) = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.pointage_fin_auto := false;
  elsif new.pointage_fin is distinct from old.pointage_fin then
    -- Départ pointé, rejoué, corrigé ou effacé : ce n'est plus une clôture
    -- d'office.
    new.pointage_fin_auto := false;
  elsif new.pointage_fin_auto and not old.pointage_fin_auto then
    -- Le drapeau ne se pose pas à la main. Le retirer (correction qui garde
    -- l'heure posée d'office) reste permis.
    new.pointage_fin_auto := false;
  end if;
  return new;
end;
$$;

revoke all on function public.shifts_fin_auto_garde() from public, anon, authenticated;

drop trigger if exists trg_shifts_fin_auto on public.shifts;
create trigger trg_shifts_fin_auto
  before insert or update of pointage_fin, pointage_fin_auto on public.shifts
  for each row execute function public.shifts_fin_auto_garde();

-- 3. Clôture d'office ----------------------------------------------------------
create or replace function public.clore_pointages_oublies()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_maintenant timestamp := now() at time zone 'Europe/Zurich';
  v_clos       integer   := 0;
begin
  perform set_config('app.cloture_pointages', 'on', true);

  with regles as (
    -- Un entier de 8 à 16 seulement, comme le lit le front (normaliserPointage).
    select r.etablissement_id, (r.pointage->>'cloture_auto_h')::int as h
      from reglages_maison r
     where jsonb_typeof(r.pointage->'cloture_auto_h') = 'number'
       and (r.pointage->>'cloture_auto_h') ~ '^(8|9|1[0-6])$'
  ),
  ouverts as (
    select s.id, g.h,
           -- Arrivée en heure de Zurich. Une arrivée à plus de 12 h de l'heure
           -- prévue a franchi minuit (horaire de nuit) : jour suivant ou
           -- précédent.
           s.date + s.pointage_debut
             + case when s.debut - s.pointage_debut > interval '12 hours' then interval '1 day'
                    when s.pointage_debut - s.debut > interval '12 hours' then interval '-1 day'
                    else interval '0' end
             as arrivee,
           -- Fin prévue : le lendemain quand elle tombe avant le début.
           s.date + s.fin
             + case when s.fin < s.debut then interval '1 day' else interval '0' end
             as fin_prevue
      from shifts s
      join regles g on g.etablissement_id = s.etablissement_id
     where s.pointage_debut is not null
       and s.pointage_fin is null
       and s.date between v_maintenant::date - 2 and v_maintenant::date
  )
  update shifts s
     set pointage_fin = (case when o.fin_prevue > o.arrivee then o.fin_prevue
                              else o.arrivee + make_interval(hours => o.h) end)::time,
         pointage_fin_auto = true
    from ouverts o
   where s.id = o.id
     -- Relu sur la ligne verrouillée : un départ pointé entre-temps gagne.
     and s.pointage_fin is null
     and o.arrivee + make_interval(hours => o.h) <= v_maintenant
     -- Jamais avant la fin prévue : la personne peut encore être là.
     and o.fin_prevue <= v_maintenant;
  get diagnostics v_clos = row_count;

  perform set_config('app.cloture_pointages', '', true);
  return v_clos;
end;
$$;

revoke all on function public.clore_pointages_oublies() from public, anon, authenticated;
grant execute on function public.clore_pointages_oublies() to service_role;

comment on function public.clore_pointages_oublies() is
  'Clôt d''office les départs oubliés selon reglages_maison.pointage.cloture_auto_h (8 à 16 h). service_role seul, appelée par alerts-evaluator chaque heure. Rend le nombre d''horaires clos.';

-- 4. Départ en ligne : écrase une fin posée d'office ---------------------------
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

-- 5. Départ hors ligne rejoué : idem -------------------------------------------
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
