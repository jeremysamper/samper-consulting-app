-- ════════════════════════════════════════════════════════════════════════════
-- Réservation d'une table en ligne : le client choisit sa table (lot L9)
-- ───────────────────────────────────────────────────────────────────────────
-- Le restaurant peut laisser le visiteur choisir sa table sur le plan de salle
-- (non par défaut), dans les salles qu'il ouvre à ce choix. Sur la page
-- /table/<adresse>, après le jour et l'heure, le plan des salles ouvertes
-- montre les tables libres pour ce créneau et ce nombre de personnes ; les
-- autres sont grisées et sans nom. « Peu importe » reste possible.
--
-- Migration additive (expand), idempotente :
--   • reservation_en_ligne_parametres : choix_table (non par défaut) et
--     salles_choix_table (ids des salles ouvertes au choix) ;
--   • reservations : table_demandee_id, la table choisie en ligne (trace de
--     la demande ; la table réellement occupée reste dans reservation_tables,
--     que l'équipe change comme d'habitude) ;
--   • resa_duree_tablee() et resa_tables_libres_en_ligne() : règle de durée
--     et tables libres, internes (aucun accès anon ni authenticated) ;
--   • table_en_ligne_plan() : RPC anonyme du plan, SECURITY DEFINER ;
--   • resa_reserver_en_ligne() : un argument p_table (défaut null) ; la table
--     est revérifiée sous le verrou de la réservation, puis posée.
--
-- Ce que la RPC anonyme renvoie, et rien d'autre : le nom des salles
-- ouvertes, la géométrie de leurs tables (position, taille à l'échelle de la
-- salle, places, forme, quart de tour du service) et un booléen « libre ».
-- L'id et le numéro d'une table ne sont rendus que quand elle est libre. Le
-- décor (murs, baies, bar) est rendu sans son libellé. Aucune réservation,
-- aucun nom ni aucune donnée de client : la disponibilité est calculée dans
-- la base et seul le booléen sort. La RPC ne répond que pour une adresse
-- ouverte, choix activé, dans l'horizon de réservation et dans les heures
-- d'arrivée du service : elle ne sert pas à lire l'occupation d'un autre jour.
--
-- Signature de resa_reserver_en_ligne (observation 0219) : remplacée par drop
-- de l'ancienne (9 arguments) et create de la nouvelle (10, le dernier avec
-- défaut) dans la même transaction. L'Edge Function spa-mailer déployée avant
-- ce lot appelle avec ses 9 arguments nommés et tombe sur la nouvelle. Rejouer
-- plus tard 20261009_reservation_services_fermes.sql recréerait l'ancienne à
-- côté : ne pas le faire sans retirer celle-ci.
--
-- Front déployé avant ce lot : select('*') sur reservations et sur les
-- réglages lit deux colonnes de plus, sans effet. Rollback :
-- 20261122_reservation_choix_table.rollback.sql.
--
-- Une seule transaction (begin / commit) : le drop et le create de la
-- réservation ne laissent jamais d'instant sans fonction. Attente de verrou
-- bornée : l'alter sur reservations ne bloque pas la caisse derrière une
-- transaction longue, il échoue et se rejoue.
-- ════════════════════════════════════════════════════════════════════════════
begin;

set local lock_timeout = '3s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Réglages : laisser choisir la table, et dans quelles salles
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.reservation_en_ligne_parametres
  add column if not exists choix_table        boolean not null default false,
  add column if not exists salles_choix_table text[]  not null default '{}';

comment on column public.reservation_en_ligne_parametres.choix_table is
  'Vrai : le visiteur de /table/<slug> peut choisir sa table sur le plan (salles de salles_choix_table). Faux par défaut.';
comment on column public.reservation_en_ligne_parametres.salles_choix_table is
  'Ids des salles (salles.id) ouvertes au choix de la table en ligne.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Réservations : la table demandée en ligne
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.reservations
  add column if not exists table_demandee_id text;

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'reservations_table_demandee_fkey'
                    and conrelid = 'public.reservations'::regclass) then
    alter table public.reservations
      add constraint reservations_table_demandee_fkey
      foreign key (table_demandee_id) references public.salle_tables(id) on delete set null;
  end if;
end $$;

-- Index de la clé étrangère (suppression d'une table : on delete set null).
create index if not exists idx_reservations_table_demandee
  on public.reservations(table_demandee_id) where table_demandee_id is not null;

comment on column public.reservations.table_demandee_id is
  'Table choisie par le client en ligne (lot L9). Trace de la demande : la table occupée est dans reservation_tables, l''équipe peut la changer.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Règle de durée d'une tablée (minutes)
-- ─────────────────────────────────────────────────────────────────────────────
-- Même règle que l'app : DUREE_TABLEE de src/modules/salle/planTemps.js
-- (midi 1 h 30, brunch et soir 2 h ; service inconnu : comme le soir).
-- Le test src/reservation/choixTable.test.mjs relit ces valeurs ici.
create or replace function public.resa_duree_tablee(p_service text)
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_service
    when 'midi'   then 90
    when 'brunch' then 120
    when 'soir'   then 120
    else 120
  end
$$;

revoke all on function public.resa_duree_tablee(text) from public, anon, authenticated;
grant execute on function public.resa_duree_tablee(text) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Tables libres pour un créneau (interne)
-- ─────────────────────────────────────────────────────────────────────────────
-- Une table convient quand :
--   • elle est active, dans une salle active de l'établissement, et sa salle
--     est dans p_salles ;
--   • elle a assez de places, au plus deux de trop (un couple ne bloque pas
--     une table de huit) ; une place de bar ne reçoit qu'une personne ;
--   • elle n'est pas rapprochée d'une autre pour ce service (tablée de
--     salle_tables_service.fusion : l'équipe l'a préparée pour un groupe) ;
--   • aucune réservation vivante posée sur elle ce jour-là ne chevauche la
--     fenêtre [arrivée, arrivée + durée du service). Vivante : ni partie, ni
--     no-show, ni annulée. Un client arrivé aujourd'hui occupe sa table au
--     moins jusqu'à maintenant + 15 minutes (fenetre() de planTemps.js).
-- Même calcul côté JavaScript : tablesLibres() de src/reservation/choixTable.js
-- (démo publique et tests).
--
-- SECURITY INVOKER et sans droit pour anon ni authenticated : elle n'est
-- appelée que par les deux fonctions SECURITY DEFINER ci-dessous, qui
-- l'exécutent avec les droits de leur propriétaire.
create or replace function public.resa_tables_libres_en_ligne(
  p_etab     text,
  p_date     date,
  p_service  text,
  p_heure    time,
  p_couverts integer,
  p_salles   text[]
)
returns setof text
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with horloge as (
    select (now() at time zone 'Europe/Zurich')::date as aujourdhui,
           extract(hour from (now() at time zone 'Europe/Zurich'))::int * 60
             + extract(minute from (now() at time zone 'Europe/Zurich'))::int as maintenant
  ),
  demande as (
    select extract(hour from p_heure)::int * 60 + extract(minute from p_heure)::int as debut,
           extract(hour from p_heure)::int * 60 + extract(minute from p_heure)::int
             + public.resa_duree_tablee(p_service) as fin
  ),
  occupees as (
    select distinct rt.table_id
      from public.reservation_tables rt
      join public.reservations r on r.id = rt.reservation_id
      cross join horloge h
      cross join demande d
     where r.etablissement_id = p_etab
       and r.date_service = p_date
       and r.statut not in ('parti', 'no_show', 'annule')
       and r.heure_arrivee is not null
       and (extract(hour from r.heure_arrivee)::int * 60 + extract(minute from r.heure_arrivee)::int) < d.fin
       and d.debut < case
             when r.statut = 'arrive' and p_date = h.aujourdhui
               then greatest(
                 extract(hour from r.heure_arrivee)::int * 60 + extract(minute from r.heure_arrivee)::int
                   + public.resa_duree_tablee(r.service),
                 h.maintenant + 15)
             else extract(hour from r.heure_arrivee)::int * 60 + extract(minute from r.heure_arrivee)::int
                   + public.resa_duree_tablee(r.service)
           end
  )
  select t.id
    from public.salle_tables t
    join public.salles s on s.id = t.salle_id
   where t.etablissement_id = p_etab
     and s.etablissement_id = p_etab
     and t.actif
     and coalesce(s.actif, true)
     and t.salle_id = any(coalesce(p_salles, '{}'))
     and p_couverts >= 1
     and t.nb_places >= p_couverts
     and t.nb_places <= p_couverts + 2
     and (t.forme <> 'tabouret' or p_couverts = 1)
     and not exists (
       select 1 from public.salle_tables_service a
        where a.table_id = t.id and a.etablissement_id = p_etab
          and a.date_service = p_date and a.service = p_service
          and a.fusion is not null)
     and not exists (select 1 from occupees o where o.table_id = t.id)
$$;

revoke all on function public.resa_tables_libres_en_ligne(text, date, text, time, integer, text[])
  from public, anon, authenticated;
grant execute on function public.resa_tables_libres_en_ligne(text, date, text, time, integer, text[])
  to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Le plan, pour la page publique (anonyme)
-- ─────────────────────────────────────────────────────────────────────────────
-- table_en_ligne_plan(adresse, jour, heure, personnes [, service])
-- Réponse : { ouvert: false, raison } ou
-- { ouvert: true, service, salles: [ { id, nom, tables: [ { id, nom, forme,
--   places, x, y, largeur, hauteur, pivotee, libre } ], decor: [ { type, x, y,
--   largeur, hauteur, rotation } ] } ] }
-- id et nom d'une table : null quand elle n'est pas libre.
-- Le service se déduit de l'heure (horaires du jour) quand p_service manque.
create or replace function public.table_en_ligne_plan(
  p_adresse   text,
  p_jour      date,
  p_heure     time,
  p_personnes integer,
  p_service   text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_p        public.reservation_en_ligne_parametres%rowtype;
  v_auj      date := (now() at time zone 'Europe/Zurich')::date;
  v_mnt      integer := extract(hour from (now() at time zone 'Europe/Zurich'))::int * 60
                        + extract(minute from (now() at time zone 'Europe/Zurich'))::int;
  v_iso      text;
  v_min      integer;
  v_plage    jsonb;
  v_service  text;
  v_s        text;
  v_libres   text[];
  v_salles   jsonb;
begin
  if p_adresse is null or p_jour is null or p_heure is null or p_personnes is null then
    return jsonb_build_object('ouvert', false, 'raison', 'parametres');
  end if;

  select * into v_p from public.reservation_en_ligne_parametres
   where slug = lower(btrim(p_adresse)) and en_ligne_actif;
  if not found or not v_p.choix_table or coalesce(cardinality(v_p.salles_choix_table), 0) = 0 then
    return jsonb_build_object('ouvert', false, 'raison', 'ferme');
  end if;

  if p_personnes < 1 or p_personnes > v_p.max_couverts then
    return jsonb_build_object('ouvert', false, 'raison', 'couverts');
  end if;
  if p_jour < v_auj or p_jour > v_auj + v_p.horizon_jours or p_jour = any(v_p.jours_fermes) then
    return jsonb_build_object('ouvert', false, 'raison', 'jour');
  end if;

  -- Service : celui demandé s'il ouvre à cette heure, sinon le premier dont
  -- la fenêtre d'arrivée du jour contient l'heure.
  v_iso := extract(isodow from p_jour)::int::text;
  v_min := extract(hour from p_heure)::int * 60 + extract(minute from p_heure)::int;
  foreach v_s in array (case when p_service in ('midi', 'soir', 'brunch')
                             then array[p_service] else array['midi', 'soir', 'brunch'] end) loop
    v_plage := v_p.horaires -> v_iso -> v_s;
    if v_plage is not null
       and coalesce(v_plage->>'de', '') ~ '^\d{2}:\d{2}$'
       and coalesce(v_plage->>'a', '') ~ '^\d{2}:\d{2}$'
       and v_min >= split_part(v_plage->>'de', ':', 1)::int * 60 + split_part(v_plage->>'de', ':', 2)::int
       and v_min <= split_part(v_plage->>'a', ':', 1)::int * 60 + split_part(v_plage->>'a', ':', 2)::int then
      -- Heure sur la grille des heures proposées (pas_minutes depuis le début
      -- du service) : la fonction ne répond que pour une heure offerte.
      if (v_min - (split_part(v_plage->>'de', ':', 1)::int * 60 + split_part(v_plage->>'de', ':', 2)::int))
         % greatest(coalesce(v_p.pas_minutes, 15), 1) = 0 then
        v_service := v_s;
        exit;
      end if;
    end if;
  end loop;
  if v_service is null then return jsonb_build_object('ouvert', false, 'raison', 'horaire'); end if;
  if coalesce(v_p.services_fermes -> p_jour::text, '[]'::jsonb) ? v_service then
    return jsonb_build_object('ouvert', false, 'raison', 'jour');
  end if;
  -- Délai minimal, comme les heures proposées (creneauxTable de spa-mailer).
  if p_jour = v_auj and v_min < v_mnt + coalesce(v_p.delai_min_heures, 0) * 60 then
    return jsonb_build_object('ouvert', false, 'raison', 'horaire');
  end if;

  v_libres := array(
    select public.resa_tables_libres_en_ligne(
      v_p.etablissement_id, p_jour, v_service, p_heure, p_personnes, v_p.salles_choix_table));

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id,
           'nom', s.nom,
           'tables', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id',       case when t.id = any(v_libres) then t.id end,
                      'nom',      case when t.id = any(v_libres) then t.nom end,
                      'forme',    t.forme,
                      'places',   t.nb_places,
                      'x',        coalesce(case when a.pos_x is not null and a.pos_y is not null then a.pos_x end, t.pos_x),
                      'y',        coalesce(case when a.pos_x is not null and a.pos_y is not null then a.pos_y end, t.pos_y),
                      'largeur',  case when coalesce(a.pivotee, false) then t.hauteur else t.largeur end,
                      'hauteur',  case when coalesce(a.pivotee, false) then t.largeur else t.hauteur end,
                      'pivotee',  coalesce(a.pivotee, false),
                      'libre',    t.id = any(v_libres)
                    ) order by t.pos_y, t.pos_x)
               from public.salle_tables t
               left join public.salle_tables_service a
                 on a.table_id = t.id and a.etablissement_id = v_p.etablissement_id
                and a.date_service = p_jour and a.service = v_service
              where t.salle_id = s.id and t.etablissement_id = v_p.etablissement_id and t.actif), '[]'::jsonb),
           'decor', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'type', e.type, 'x', e.pos_x, 'y', e.pos_y,
                      'largeur', e.largeur, 'hauteur', e.hauteur, 'rotation', e.rotation))
               from public.salle_elements e
              where e.salle_id = s.id and e.etablissement_id = v_p.etablissement_id), '[]'::jsonb)
         ) order by s.ordre, s.nom), '[]'::jsonb)
    into v_salles
    from public.salles s
   where s.etablissement_id = v_p.etablissement_id
     and coalesce(s.actif, true)
     and s.id = any(v_p.salles_choix_table);

  return jsonb_build_object('ouvert', true, 'service', v_service, 'salles', v_salles);
end $$;

revoke all on function public.table_en_ligne_plan(text, date, time, integer, text)
  from public, anon, authenticated;
grant execute on function public.table_en_ligne_plan(text, date, time, integer, text)
  to anon, authenticated, service_role;

comment on function public.table_en_ligne_plan(text, date, time, integer, text) is
  'Page /table/<slug> (lot L9) : plan des salles ouvertes au choix de la table, géométrie et booléen libre. Anonyme : aucun nom de client ni réservation ; id et numéro d''une table seulement quand elle est libre.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Réservation atomique : la table souhaitée, revérifiée sous verrou
-- ─────────────────────────────────────────────────────────────────────────────
-- Corps repris de la version en base (20261009 + capacité par jour), avec :
--   • p_table (défaut null) : la table choisie ; revérifiée sous le verrou
--     (choix activé, table libre et à la bonne taille pour ce créneau), sinon
--     { erreur: 'table_prise' } ;
--   • la réservation garde table_demandee_id et est posée sur la table
--     (reservation_tables), comme si l'hôte l'y avait placée ;
--   • la réponse rend table_nom quand une table est posée.
drop function if exists public.resa_reserver_en_ligne(text, date, text, time, integer, text, text, text, text);

create or replace function public.resa_reserver_en_ligne(
  p_etab       text,
  p_date       date,
  p_service    text,
  p_heure      time,
  p_couverts   integer,
  p_nom        text,
  p_telephone  text,
  p_email      text,
  p_message    text,
  p_table      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_params    public.reservation_en_ligne_parametres%rowtype;
  v_plage     jsonb;
  v_min       integer;
  v_de        integer;
  v_a         integer;
  v_service   integer;
  v_creneau   integer;
  v_bloc      integer;
  v_cle       text;
  v_limite    integer;
  v_demi      integer;
  v_jour      text;
  v_capacite  integer;
  v_statut    text;
  v_res       text;
  v_table     text := nullif(btrim(coalesce(p_table, '')), '');
  v_table_nom text;
begin
  perform pg_advisory_xact_lock(hashtext('resa-en-ligne:' || p_etab || ':' || p_date::text));

  select * into v_params from public.reservation_en_ligne_parametres
   where etablissement_id = p_etab and en_ligne_actif;
  if not found then return jsonb_build_object('erreur', 'ferme'); end if;

  if p_date = any(v_params.jours_fermes) then return jsonb_build_object('erreur', 'jour_ferme'); end if;
  -- Fermeture d'un seul service ce jour-là (soir privatisé, midi fermé...).
  if coalesce(v_params.services_fermes -> p_date::text, '[]'::jsonb) ? p_service then
    return jsonb_build_object('erreur', 'service_ferme');
  end if;
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

  -- Table souhaitée : revérifiée ici, sous le verrou, avec la même règle que
  -- le plan montré au visiteur. Prise entre-temps, trop petite, salle fermée
  -- au choix ou choix désactivé : le visiteur choisit une autre table.
  if v_table is not null then
    if not v_params.choix_table
       or not exists (
         select 1 from public.resa_tables_libres_en_ligne(
           p_etab, p_date, p_service, p_heure, p_couverts, v_params.salles_choix_table) x
          where x = v_table) then
      return jsonb_build_object('erreur', 'table_prise');
    end if;
    select nom into v_table_nom from public.salle_tables where id = v_table;
  end if;

  v_statut := case when v_params.mode = 'auto' then 'confirme' else 'demande' end;

  insert into public.reservations
    (etablissement_id, date_service, service, heure_arrivee, nb_couverts, nom, telephone, email,
     notes_libres, statut, origine, table_demandee_id)
  values
    (p_etab, p_date, p_service, p_heure, p_couverts, btrim(p_nom), nullif(btrim(coalesce(p_telephone, '')), ''),
     nullif(lower(btrim(coalesce(p_email, ''))), ''), nullif(btrim(coalesce(p_message, '')), ''), v_statut, 'en_ligne',
     v_table)
  returning id into v_res;

  if v_table is not null then
    insert into public.reservation_tables (reservation_id, table_id) values (v_res, v_table);
    return jsonb_build_object('reservation_id', v_res, 'statut', v_statut, 'table_nom', v_table_nom);
  end if;
  return jsonb_build_object('reservation_id', v_res, 'statut', v_statut);
end $$;

revoke all on function public.resa_reserver_en_ligne(text, date, text, time, integer, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.resa_reserver_en_ligne(text, date, text, time, integer, text, text, text, text, text)
  to service_role;

comment on function public.resa_reserver_en_ligne(text, date, text, time, integer, text, text, text, text, text) is
  'Réservation de table en ligne atomique (verrou établissement + jour), table souhaitée revérifiée (lot L9). Service role seulement : appelée par l''Edge Function spa-mailer.';

commit;
