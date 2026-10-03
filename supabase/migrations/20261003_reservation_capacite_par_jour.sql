-- ════════════════════════════════════════════════════════════════════════════
-- Réservation d'une table en ligne - couverts au plus, jour par jour
-- ───────────────────────────────────────────────────────────────────────────
-- Suite de 20260929_reservation_rythme_demi_heure. Le plafond de couverts par
-- service (capacite_service) était le même tous les jours. Un restaurant
-- n'ouvre pas autant le mercredi que le samedi : mercredi soir 40, jeudi soir
-- 70, etc.
--   • capacite_jours : plafond propre à un service d'un jour de la semaine
--     (jour ISO, 1 = lundi), qui prime sur capacite_service ;
--     { "3": { "soir": 40 }, "4": { "midi": 30, "soir": 70 } }.
--     0 ferme ce service en ligne ce jour-là. Absent = capacite_service.
-- Toutes les réservations du service comptent (téléphone compris), comme
-- avant.
--
-- Additive : une colonne (vide par défaut = comportement inchangé) sur une
-- table que seul le front de réglage écrit ; le front déployé ne l'envoie pas
-- et l'upsert ne touche que les colonnes envoyées. resa_reserver_en_ligne est
-- remplacée à signature identique. Idempotente. Rollback en fin de fichier.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.reservation_en_ligne_parametres
  add column if not exists capacite_jours jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'resa_en_ligne_capacite_jours') then
    alter table public.reservation_en_ligne_parametres
      add constraint resa_en_ligne_capacite_jours check (jsonb_typeof(capacite_jours) = 'object');
  end if;
end $$;

create or replace function public.resa_reserver_en_ligne(
  p_etab       text,
  p_date       date,
  p_service    text,
  p_heure      time,
  p_couverts   integer,
  p_nom        text,
  p_telephone  text,
  p_email      text,
  p_message    text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_params   public.reservation_en_ligne_parametres%rowtype;
  v_plage    jsonb;
  v_min      integer;
  v_de       integer;
  v_a        integer;
  v_service  integer;
  v_creneau  integer;
  v_bloc     integer;
  v_cle      text;
  v_limite   integer;
  v_demi     integer;
  v_jour     text;
  v_capacite integer;
  v_statut   text;
  v_res      text;
begin
  perform pg_advisory_xact_lock(hashtext('resa-en-ligne:' || p_etab || ':' || p_date::text));

  select * into v_params from public.reservation_en_ligne_parametres
   where etablissement_id = p_etab and en_ligne_actif;
  if not found then return jsonb_build_object('erreur', 'ferme'); end if;

  if p_date = any(v_params.jours_fermes) then return jsonb_build_object('erreur', 'jour_ferme'); end if;
  if p_couverts is null or p_couverts < 1 or p_couverts > v_params.max_couverts then
    return jsonb_build_object('erreur', 'couverts');
  end if;

  v_plage := v_params.horaires -> extract(isodow from p_date)::int::text -> p_service;
  if v_plage is null or coalesce(v_plage->>'de', '') = '' or coalesce(v_plage->>'a', '') = '' then
    return jsonb_build_object('erreur', 'horaire');
  end if;
  v_min := extract(hour from p_heure)::int * 60 + extract(minute from p_heure)::int;
  v_de  := split_part(v_plage->>'de', ':', 1)::int * 60 + split_part(v_plage->>'de', ':', 2)::int;
  v_a   := split_part(v_plage->>'a', ':', 1)::int * 60 + split_part(v_plage->>'a', ':', 2)::int;
  if v_min < v_de or v_min > v_a then return jsonb_build_object('erreur', 'horaire'); end if;

  -- Plafond du service : réglage propre à ce jour de la semaine, sinon défaut.
  v_jour := extract(isodow from p_date)::int::text;
  v_capacite := coalesce(
    case when jsonb_typeof(v_params.capacite_jours -> v_jour -> p_service) = 'number'
         then (v_params.capacite_jours -> v_jour ->> p_service)::int end,
    v_params.capacite_service);

  select coalesce(sum(nb_couverts), 0) into v_service from public.reservations
   where etablissement_id = p_etab and date_service = p_date and service = p_service
     and statut not in ('annule', 'no_show');
  if v_service + p_couverts > v_capacite then
    return jsonb_build_object('erreur', 'complet');
  end if;

  if v_params.capacite_creneau is not null then
    select coalesce(sum(nb_couverts), 0) into v_creneau from public.reservations
     where etablissement_id = p_etab and date_service = p_date and service = p_service
       and heure_arrivee = p_heure and statut not in ('annule', 'no_show');
    if v_creneau + p_couverts > v_params.capacite_creneau then
      return jsonb_build_object('erreur', 'creneau_pris');
    end if;
  end if;

  -- Rythme : plafond de la demi-heure d'arrivée (réglage propre, sinon défaut).
  v_bloc := (v_min / 30) * 30;
  v_cle := lpad((v_bloc / 60)::text, 2, '0') || ':' || lpad((v_bloc % 60)::text, 2, '0');
  v_limite := coalesce(
    case when jsonb_typeof(v_params.rythme -> p_service -> v_cle) = 'number'
         then (v_params.rythme -> p_service ->> v_cle)::int end,
    v_params.capacite_demi_heure);
  if v_limite is not null then
    select coalesce(sum(nb_couverts), 0) into v_demi from public.reservations
     where etablissement_id = p_etab and date_service = p_date and service = p_service
       and statut not in ('annule', 'no_show')
       and (extract(hour from heure_arrivee)::int * 60 + extract(minute from heure_arrivee)::int) / 30 * 30 = v_bloc;
    if v_demi + p_couverts > v_limite then
      return jsonb_build_object('erreur', 'demi_heure');
    end if;
  end if;

  v_statut := case when v_params.mode = 'auto' then 'confirme' else 'demande' end;

  insert into public.reservations
    (etablissement_id, date_service, service, heure_arrivee, nb_couverts, nom, telephone, email,
     notes_libres, statut, origine)
  values
    (p_etab, p_date, p_service, p_heure, p_couverts, btrim(p_nom), nullif(btrim(coalesce(p_telephone, '')), ''),
     nullif(lower(btrim(coalesce(p_email, ''))), ''), nullif(btrim(coalesce(p_message, '')), ''), v_statut, 'en_ligne')
  returning id into v_res;

  return jsonb_build_object('reservation_id', v_res, 'statut', v_statut);
end $$;

revoke all on function public.resa_reserver_en_ligne(text, date, text, time, integer, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.resa_reserver_en_ligne(text, date, text, time, integer, text, text, text, text)
  to service_role;

comment on column public.reservation_en_ligne_parametres.capacite_jours is
  'Couverts au plus par service, propres à un jour de la semaine (ISO, 1 = lundi) : { "3": { "soir": 40 } }. Prime sur capacite_service ; 0 ferme ce service en ligne ce jour-là.';

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (à exécuter manuellement si besoin) :
--   réappliquer la fonction de 20260929_reservation_rythme_demi_heure.sql, puis
--   alter table public.reservation_en_ligne_parametres drop constraint if exists resa_en_ligne_capacite_jours;
--   alter table public.reservation_en_ligne_parametres drop column if exists capacite_jours;
-- ════════════════════════════════════════════════════════════════════════════
