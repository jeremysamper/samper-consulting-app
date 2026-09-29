-- ════════════════════════════════════════════════════════════════════════════
-- Réservations (module Prévisions) - réservation d'une table en ligne
-- ───────────────────────────────────────────────────────────────────────────
-- Même principe que la réservation en ligne du Spa (20260928) : chaque
-- restaurant ouvre une page publique /table/<adresse>, qu'il met sur son site
-- (lien, QR code ou widget). Le visiteur choisit le nombre de personnes, le
-- jour et l'heure d'arrivée, puis laisse ses coordonnées.
--
-- Deux modes, au choix du restaurant :
--   'demande' (défaut) : la réservation arrive « À confirmer », l'équipe
--                        confirme ou refuse ;
--   'auto'             : confirmée tout de suite, dans la limite des couverts
--                        ouverts en ligne.
-- La table n'est jamais attribuée en ligne : l'hôte place la réservation sur
-- le plan de salle comme les autres.
--
-- Aucun accès anonyme aux tables : tout passe par l'Edge Function spa-mailer
-- (actions public_table_*), qui ne renvoie que les heures encore ouvertes,
-- jamais le nom d'un autre client. La réservation passe par
-- resa_reserver_en_ligne(), exécutée sous verrou (établissement + jour) :
-- deux visiteurs ne peuvent pas dépasser ensemble la capacité.
--
-- Migration additive (expand) :
--   • reservation_en_ligne_parametres : réglages par établissement ;
--   • reservations : statut 'demande' (contrainte élargie), colonnes email et
--     origine ;
--   • fonction resa_reserver_en_ligne (service role seulement).
-- Le front déployé avant elle ne lit aucune de ces colonnes ; une réservation
-- 'demande' s'y affiche comme « Attendu » (repli de metaStatut) et compte dans
-- les couverts prévus (le trigger n'exclut que 'annule' et 'no_show'), ce qui
-- est le bon sens pour la cuisine. Idempotente. Rollback en fin de fichier.
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Réglages par établissement
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.reservation_en_ligne_parametres (
  etablissement_id  text        primary key references public.etablissements(id) on delete cascade,
  en_ligne_actif    boolean     not null default false,
  slug              text,
  mode              text        not null default 'demande',
  -- Heures d'arrivée proposées, par jour ISO (1 = lundi) et par service :
  -- { "1": { "midi": {"de":"12:00","a":"13:30"}, "soir": {"de":"19:00","a":"21:00"} }, … }
  -- « a » est la dernière heure d'arrivée proposée (incluse).
  horaires          jsonb       not null default '{}'::jsonb,
  -- Couverts au plus par service (toutes réservations comptées, équipe
  -- comprise) : au-delà, le service n'est plus proposé en ligne.
  capacite_service  integer     not null default 40,
  -- Couverts au plus arrivant à la même heure (NULL = pas de limite).
  capacite_creneau  integer,
  -- Taille maximale d'une réservation en ligne ; au-delà, le visiteur est
  -- invité à appeler (groupes).
  max_couverts      integer     not null default 8,
  delai_min_heures  integer     not null default 2,
  horizon_jours     integer     not null default 60,
  pas_minutes       integer     not null default 15,
  jours_fermes      date[]      not null default '{}',
  message_en_ligne  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'resa_en_ligne_slug_forme') then
    alter table public.reservation_en_ligne_parametres
      add constraint resa_en_ligne_slug_forme check (slug is null or slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'resa_en_ligne_mode') then
    alter table public.reservation_en_ligne_parametres
      add constraint resa_en_ligne_mode check (mode in ('demande', 'auto'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'resa_en_ligne_bornes') then
    alter table public.reservation_en_ligne_parametres
      add constraint resa_en_ligne_bornes check (
        capacite_service between 1 and 2000
        and (capacite_creneau is null or capacite_creneau between 1 and 2000)
        and max_couverts between 1 and 50
        and delai_min_heures between 0 and 168
        and horizon_jours between 1 and 365
        and pas_minutes in (15, 30, 60)
      );
  end if;
end $$;

-- Une adresse de réservation = un établissement.
create unique index if not exists uq_resa_en_ligne_slug
  on public.reservation_en_ligne_parametres(slug) where slug is not null;

alter table public.reservation_en_ligne_parametres enable row level security;

-- Lecture : l'équipe de l'établissement. Écriture : la direction.
drop policy if exists resa_en_ligne_select on public.reservation_en_ligne_parametres;
create policy resa_en_ligne_select on public.reservation_en_ligne_parametres
  for select to authenticated using (user_can_access_etab(etablissement_id));

drop policy if exists resa_en_ligne_insert on public.reservation_en_ligne_parametres;
create policy resa_en_ligne_insert on public.reservation_en_ligne_parametres
  for insert to authenticated
  with check (user_can_access_etab(etablissement_id)
              and (select current_user_role()) = any(array['consultant','patron']));

drop policy if exists resa_en_ligne_update on public.reservation_en_ligne_parametres;
create policy resa_en_ligne_update on public.reservation_en_ligne_parametres
  for update to authenticated
  using (user_can_access_etab(etablissement_id)
         and (select current_user_role()) = any(array['consultant','patron']))
  with check (user_can_access_etab(etablissement_id)
              and (select current_user_role()) = any(array['consultant','patron']));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Réservations : statut « demande », e-mail et origine
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.reservations drop constraint if exists reservations_statut_check;
alter table public.reservations
  add constraint reservations_statut_check
  check (statut in ('demande', 'confirme', 'arrive', 'parti', 'no_show', 'annule'));

alter table public.reservations
  add column if not exists email   text,
  add column if not exists origine text not null default 'equipe';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reservations_origine_check') then
    alter table public.reservations
      add constraint reservations_origine_check check (origine in ('equipe', 'en_ligne'));
  end if;
end $$;

-- Bandeau « demandes à confirmer » du module : lecture par établissement et
-- statut (petit volume, index partiel).
create index if not exists idx_reservations_demandes
  on public.reservations(etablissement_id, date_service) where statut = 'demande';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Réservation atomique
-- ─────────────────────────────────────────────────────────────────────────────
-- Sous verrou (établissement, jour) : relit les réglages et l'occupation du
-- service, puis pose la réservation ('demande' ou 'confirme' selon le mode).
-- Délai minimal et horizon sont vérifiés par l'Edge Function (heure de Zurich).
-- Réponse : { reservation_id, statut } ou
-- { erreur: 'ferme' | 'jour_ferme' | 'couverts' | 'horaire' | 'complet' | 'creneau_pris' }.
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

  -- L'heure doit tomber dans la fenêtre d'arrivée du service ce jour-là.
  v_plage := v_params.horaires -> extract(isodow from p_date)::int::text -> p_service;
  if v_plage is null or coalesce(v_plage->>'de', '') = '' or coalesce(v_plage->>'a', '') = '' then
    return jsonb_build_object('erreur', 'horaire');
  end if;
  v_min := extract(hour from p_heure)::int * 60 + extract(minute from p_heure)::int;
  v_de  := split_part(v_plage->>'de', ':', 1)::int * 60 + split_part(v_plage->>'de', ':', 2)::int;
  v_a   := split_part(v_plage->>'a', ':', 1)::int * 60 + split_part(v_plage->>'a', ':', 2)::int;
  if v_min < v_de or v_min > v_a then return jsonb_build_object('erreur', 'horaire'); end if;

  -- Capacité : toutes les réservations du service, équipe comprise.
  select coalesce(sum(nb_couverts), 0) into v_service from public.reservations
   where etablissement_id = p_etab and date_service = p_date and service = p_service
     and statut not in ('annule', 'no_show');
  if v_service + p_couverts > v_params.capacite_service then
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

comment on table public.reservation_en_ligne_parametres is
  'Réservation d''une table en ligne (page /table/<slug>) : réglages par établissement. Lu par l''Edge Function spa-mailer (actions public_table_*).';
comment on function public.resa_reserver_en_ligne(text, date, text, time, integer, text, text, text, text) is
  'Réservation de table en ligne atomique (verrou établissement + jour). Service role seulement : appelée par l''Edge Function spa-mailer.';
comment on column public.reservations.origine is
  'equipe = saisie dans l''app ; en_ligne = venue de la page /table/<slug> (statut initial ''demande'' ou ''confirme'' selon le mode).';

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (à exécuter manuellement si besoin) :
--
--   drop function if exists public.resa_reserver_en_ligne(text, date, text, time, integer, text, text, text, text);
--   drop index if exists public.idx_reservations_demandes;
--   update public.reservations set statut = 'confirme' where statut = 'demande';
--   alter table public.reservations drop constraint if exists reservations_origine_check;
--   alter table public.reservations drop column if exists origine, drop column if exists email;
--   alter table public.reservations drop constraint if exists reservations_statut_check;
--   alter table public.reservations add constraint reservations_statut_check
--     check (statut in ('confirme','arrive','parti','no_show','annule'));
--   drop table if exists public.reservation_en_ligne_parametres;
-- ════════════════════════════════════════════════════════════════════════════
