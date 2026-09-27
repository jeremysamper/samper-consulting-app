-- ════════════════════════════════════════════════════════════════════════════
-- Module Spa - réservation en ligne depuis le site du client
-- ───────────────────────────────────────────────────────────────────────────
-- Chaque spa peut proposer un bouton « Réserver un soin » sur son propre site
-- (une ligne de code, widget servi par samperconsulting-app.com). Le visiteur
-- choisit un soin et un créneau ; sa réservation arrive dans l'agenda comme
-- une DEMANDE, que la réception confirme ou refuse. Le spa attribue le
-- praticien (le premier libre parmi ceux ouverts à la réservation en ligne,
-- modifiable ensuite). Paiement sur place.
--
-- Aucun accès anonyme aux tables : tout passe par l'Edge Function spa-mailer
-- (actions public_*), qui ne renvoie que la carte des soins et des heures
-- libres, jamais le nom d'un autre client. La réservation elle-même passe par
-- spa_reserver_en_ligne(), exécutée sous verrou : deux visiteurs ne peuvent pas
-- obtenir le même créneau.
--
-- Migration additive (expand) :
--   • spa_parametres : colonnes de réglage de la réservation en ligne ;
--   • spa_soins.en_ligne : soins proposés en ligne ;
--   • spa_reservations : statut 'demande' (contrainte élargie) et origine ;
--   • spa_demandes_en_ligne : journal anti-abus (service role seulement) ;
--   • fonction spa_reserver_en_ligne (service role seulement).
-- Le front déployé avant cette migration ne lit aucune de ces colonnes ; un
-- statut 'demande' inconnu de lui s'affiche comme « Prévu ». Idempotente.
-- Rollback en fin de fichier.
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Réglages par établissement
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.spa_parametres
  add column if not exists en_ligne_actif     boolean not null default false,
  add column if not exists slug               text,
  -- { "1": [{"de":"09:00","a":"19:00"}], … "7": [] }, jours ISO 1 = lundi.
  add column if not exists horaires           jsonb   not null default '{}'::jsonb,
  add column if not exists praticiens_en_ligne text[] not null default '{}',
  add column if not exists delai_min_heures   integer not null default 2,
  add column if not exists horizon_jours      integer not null default 60,
  add column if not exists pas_minutes        integer not null default 30,
  add column if not exists message_en_ligne   text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'spa_parametres_slug_forme') then
    alter table public.spa_parametres
      add constraint spa_parametres_slug_forme check (slug is null or slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'spa_parametres_bornes_en_ligne') then
    alter table public.spa_parametres
      add constraint spa_parametres_bornes_en_ligne check (
        delai_min_heures between 0 and 168
        and horizon_jours between 1 and 365
        and pas_minutes in (10, 15, 20, 30, 45, 60)
      );
  end if;
end $$;

-- Une adresse de réservation = un établissement.
create unique index if not exists uq_spa_parametres_slug on public.spa_parametres(slug) where slug is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Soins proposés en ligne
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.spa_soins add column if not exists en_ligne boolean not null default true;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Réservations : statut « demande » et origine
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.spa_reservations drop constraint if exists spa_reservations_statut_check;
alter table public.spa_reservations
  add constraint spa_reservations_statut_check
  check (statut in ('demande','prevue','confirmee','terminee','annulee','absent'));

alter table public.spa_reservations
  add column if not exists origine text not null default 'equipe';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'spa_reservations_origine_check') then
    alter table public.spa_reservations
      add constraint spa_reservations_origine_check check (origine in ('equipe','en_ligne'));
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Journal anti-abus : une ligne par demande reçue du site. L'adresse IP est
--    stockée hachée (jamais en clair). Lu et écrit par l'Edge Function seule :
--    RLS active, aucune politique.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.spa_demandes_en_ligne (
  id               bigserial   primary key,
  etablissement_id text        not null references public.etablissements(id) on delete cascade,
  ip_hash          text,
  email            text,
  created_at       timestamptz not null default now()
);
create index if not exists idx_spa_demandes_ip on public.spa_demandes_en_ligne(ip_hash, created_at desc);
create index if not exists idx_spa_demandes_email on public.spa_demandes_en_ligne(email, created_at desc);
alter table public.spa_demandes_en_ligne enable row level security;
revoke all on public.spa_demandes_en_ligne from anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Réservation atomique
-- ─────────────────────────────────────────────────────────────────────────────
-- Sous verrou (établissement, jour) : relit l'occupation, choisit le premier
-- praticien en ligne libre sur toute la durée du soin, retrouve le client par
-- son e-mail (ou le crée), et pose la réservation en 'demande'.
-- Une réservation sans praticien occupe une place quelconque : elle compte
-- contre la capacité. Réponse : { reservation_id, client_id, praticien } ou
-- { erreur: 'ferme' | 'soin' | 'creneau_pris' | 'horaire' }.
create or replace function public.spa_reserver_en_ligne(
  p_etab            text,
  p_soin            text,
  p_date            date,
  p_heure           time,
  p_prenom          text,
  p_nom             text,
  p_email           text,
  p_telephone       text,
  p_date_naissance  date,
  p_consentement    boolean,
  p_message         text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_params   public.spa_parametres%rowtype;
  v_soin     public.spa_soins%rowtype;
  v_debut    integer;
  v_fin      integer;
  v_libres   text[];
  v_sans     integer;
  v_prat     text;
  v_client   text;
  v_res      text;
  v_email    text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_plages   jsonb;
  v_ok       boolean := false;
  v_plage    jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('spa-en-ligne:' || p_etab || ':' || p_date::text));

  select * into v_params from public.spa_parametres
   where etablissement_id = p_etab and en_ligne_actif;
  if not found then return jsonb_build_object('erreur', 'ferme'); end if;

  select * into v_soin from public.spa_soins
   where id = p_soin and etablissement_id = p_etab and actif and en_ligne;
  if not found then return jsonb_build_object('erreur', 'soin'); end if;

  v_debut := extract(hour from p_heure)::int * 60 + extract(minute from p_heure)::int;
  v_fin   := v_debut + v_soin.duree_min;

  -- Le créneau doit tenir dans une plage d'ouverture du jour.
  v_plages := coalesce(v_params.horaires -> extract(isodow from p_date)::int::text, '[]'::jsonb);
  for v_plage in select * from jsonb_array_elements(v_plages) loop
    if v_debut >= (split_part(v_plage->>'de', ':', 1)::int * 60 + split_part(v_plage->>'de', ':', 2)::int)
       and v_fin <= (split_part(v_plage->>'a', ':', 1)::int * 60 + split_part(v_plage->>'a', ':', 2)::int) then
      v_ok := true;
    end if;
  end loop;
  if not v_ok then return jsonb_build_object('erreur', 'horaire'); end if;

  -- Praticiens en ligne libres sur toute la durée.
  select array_agg(p order by ord) into v_libres
    from unnest(v_params.praticiens_en_ligne) with ordinality as t(p, ord)
   where not exists (
     select 1 from public.spa_reservations r
      where r.etablissement_id = p_etab
        and r.date_rdv = p_date
        and r.statut not in ('annulee', 'absent')
        and lower(btrim(coalesce(r.praticien, ''))) = lower(btrim(t.p))
        and (extract(hour from r.heure_debut)::int * 60 + extract(minute from r.heure_debut)::int) < v_fin
        and (extract(hour from r.heure_debut)::int * 60 + extract(minute from r.heure_debut)::int + r.duree_min) > v_debut
   );

  select count(*) into v_sans from public.spa_reservations r
   where r.etablissement_id = p_etab
     and r.date_rdv = p_date
     and r.statut not in ('annulee', 'absent')
     and btrim(coalesce(r.praticien, '')) = ''
     and (extract(hour from r.heure_debut)::int * 60 + extract(minute from r.heure_debut)::int) < v_fin
     and (extract(hour from r.heure_debut)::int * 60 + extract(minute from r.heure_debut)::int + r.duree_min) > v_debut;

  if coalesce(array_length(v_libres, 1), 0) - v_sans <= 0 then
    return jsonb_build_object('erreur', 'creneau_pris');
  end if;
  v_prat := v_libres[1];

  -- Client : retrouvé par e-mail (fiche archivée comprise, réactivée), sinon créé.
  if v_email is not null then
    select id into v_client from public.spa_clients
     where etablissement_id = p_etab and email = v_email
     order by archive, created_at
     limit 1;
  end if;

  if v_client is null then
    insert into public.spa_clients (etablissement_id, prenom, nom, email, telephone, date_naissance, consentement_marketing)
    values (p_etab, nullif(btrim(p_prenom), ''), nullif(btrim(p_nom), ''), v_email,
            nullif(btrim(p_telephone), ''), p_date_naissance, coalesce(p_consentement, false))
    returning id into v_client;
  else
    -- Une fiche existante n'est jamais écrasée : on complète ce qui manque, et
    -- l'accord e-mail ne peut que s'ajouter (jamais retiré par ce formulaire).
    update public.spa_clients set
      telephone              = coalesce(telephone, nullif(btrim(p_telephone), '')),
      date_naissance         = coalesce(date_naissance, p_date_naissance),
      consentement_marketing = consentement_marketing or coalesce(p_consentement, false),
      archive                = false
     where id = v_client;
  end if;

  insert into public.spa_reservations
    (etablissement_id, client_id, soin_id, soin_libelle, date_rdv, heure_debut, duree_min,
     praticien, statut, notes, origine)
  values
    (p_etab, v_client, v_soin.id, v_soin.nom, p_date, p_heure, v_soin.duree_min,
     v_prat, 'demande', nullif(btrim(coalesce(p_message, '')), ''), 'en_ligne')
  returning id into v_res;

  return jsonb_build_object('reservation_id', v_res, 'client_id', v_client, 'praticien', v_prat);
end $$;

revoke all on function public.spa_reserver_en_ligne(text, text, date, time, text, text, text, text, date, boolean, text)
  from public, anon, authenticated;
grant execute on function public.spa_reserver_en_ligne(text, text, date, time, text, text, text, text, date, boolean, text)
  to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Journal des e-mails : type 'rdv' (demande reçue, confirmée, refusée)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.spa_envois drop constraint if exists spa_envois_type_check;
alter table public.spa_envois
  add constraint spa_envois_type_check check (type in ('anniversaire','news','bon','test','rdv'));

comment on function public.spa_reserver_en_ligne(text, text, date, time, text, text, text, text, date, boolean, text) is
  'Réservation en ligne atomique (verrou établissement + jour). Service role seulement : appelée par l''Edge Function spa-mailer.';
comment on column public.spa_parametres.horaires is
  'Plages d''ouverture pour la réservation en ligne : { "1": [{"de":"09:00","a":"19:00"}], ... }, jours ISO (1 = lundi).';
comment on column public.spa_reservations.origine is
  'equipe = saisie dans l''app ; en_ligne = demande venue du site du client (statut initial ''demande'').';

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (à exécuter manuellement si besoin) :
--
--   delete from public.spa_envois where type = 'rdv';
--   alter table public.spa_envois drop constraint if exists spa_envois_type_check;
--   alter table public.spa_envois add constraint spa_envois_type_check
--     check (type in ('anniversaire','news','bon','test'));
--   drop function if exists public.spa_reserver_en_ligne(text, text, date, time, text, text, text, text, date, boolean, text);
--   drop table if exists public.spa_demandes_en_ligne;
--   update public.spa_reservations set statut = 'prevue' where statut = 'demande';
--   alter table public.spa_reservations drop constraint if exists spa_reservations_origine_check;
--   alter table public.spa_reservations drop column if exists origine;
--   alter table public.spa_reservations drop constraint if exists spa_reservations_statut_check;
--   alter table public.spa_reservations add constraint spa_reservations_statut_check
--     check (statut in ('prevue','confirmee','terminee','annulee','absent'));
--   alter table public.spa_soins drop column if exists en_ligne;
--   drop index if exists public.uq_spa_parametres_slug;
--   alter table public.spa_parametres drop constraint if exists spa_parametres_bornes_en_ligne;
--   alter table public.spa_parametres drop constraint if exists spa_parametres_slug_forme;
--   alter table public.spa_parametres
--     drop column if exists en_ligne_actif, drop column if exists slug,
--     drop column if exists horaires, drop column if exists praticiens_en_ligne,
--     drop column if exists delai_min_heures, drop column if exists horizon_jours,
--     drop column if exists pas_minutes, drop column if exists message_en_ligne;
-- ════════════════════════════════════════════════════════════════════════════
