-- ════════════════════════════════════════════════════════════════════════════
-- Fichier clients des restaurants (module Réservations, onglet Clients)
-- ───────────────────────────────────────────────────────────────────────────
-- Demande de Jérémy (01.10.2026) : une fiche par client avec l'historique de
-- ses tables, remplie pour l'instant par les réservations (en ligne et
-- manuelles), plus tard aussi par Lightspeed. La réservation en ligne recueille
-- l'accord du client pour recevoir actualités et bons cadeaux.
--
-- Choix (validés par Jérémy) :
--   • un fichier PAR ÉTABLISSEMENT : un consentement donné au Rucher ne vaut
--     pas pour Woodland ;
--   • remplissage AUTOMATIQUE : chaque réservation est rattachée à la fiche du
--     même e-mail, sinon du même téléphone, sinon une fiche est créée. Sans
--     e-mail ni téléphone (un nom seul), rien n'est créé : « Dupont » ne suffit
--     pas à reconnaître quelqu'un, on fabriquerait des doublons.
--
-- Modèle calqué sur spa_clients (consentement daté, désinscription par jeton)
-- pour que les envois d'actualités puissent réutiliser la mécanique du spa.
--
-- Le rattachement vit dans un déclencheur sur reservations et non dans le
-- front : la réservation en ligne (fonction resa_reserver_en_ligne, appelée
-- par spa-mailer) et la saisie manuelle passent par le même chemin. Il ne fait
-- JAMAIS échouer l'enregistrement d'une réservation : en cas d'erreur, la
-- réservation est gardée sans client.
--
-- Droits : lecture par l'équipe de l'établissement (les réservations, déjà
-- lisibles, portent les mêmes noms et téléphones) ; écriture selon la case
-- « Modifier » des Réservations (user_peut_gerer, migration 20261001).
--
-- Migration additive (expand) : une table, une vue, une colonne nullable sur
-- reservations, un déclencheur. Le front déployé l'ignore. Idempotente.
-- Rattachement des réservations passées : migration de données séparée
-- (20261001_resa_clients_rattachement.sql). Rollback en fin de fichier.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. La fiche client ──────────────────────────────────────────────────────
create table if not exists public.resa_clients (
  id                     text        primary key default (gen_random_uuid())::text,
  etablissement_id       text        not null references public.etablissements(id) on delete cascade,
  prenom                 text,
  nom                    text,
  email                  text,
  telephone              text,
  date_naissance         date        check (date_naissance is null or date_naissance >= date '1900-01-01'),
  allergies              text,        -- allergies, intolérances, régime
  preferences            text,        -- table préférée, vins, habitudes…
  notes                  text,
  consentement_marketing boolean     not null default false,
  consentement_at        timestamptz,
  consentement_source    text        check (consentement_source is null or consentement_source in ('en_ligne', 'equipe')),
  desinscrit_at          timestamptz,
  desinscription_token   uuid        not null default gen_random_uuid(),
  lightspeed_customer_id text,        -- réservé : rapprochement avec la caisse, plus tard
  archive                boolean     not null default false,
  created_by             text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  -- Clés de rapprochement, calculées : e-mail en minuscules ; téléphone réduit
  -- à ses 9 derniers chiffres (« 079 123 45 67 » = « +41 79 123 45 67 »).
  email_cle              text generated always as (nullif(lower(btrim(coalesce(email, ''))), '')) stored,
  telephone_cle          text generated always as (
    case when length(regexp_replace(coalesce(telephone, ''), '\D', '', 'g')) >= 6
         then right(regexp_replace(coalesce(telephone, ''), '\D', '', 'g'), 9) end
  ) stored,
  constraint resa_clients_identite check (btrim(coalesce(prenom, '') || coalesce(nom, '')) <> ''),
  constraint resa_clients_email_forme check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

comment on table public.resa_clients is
  'Fichier clients des restaurants, par établissement. Rempli par les réservations (déclencheur resa_rattacher_client) et à la main. Consentement marketing daté, désinscription par jeton (même modèle que spa_clients).';

create index if not exists idx_resa_clients_etab on public.resa_clients(etablissement_id);
create index if not exists idx_resa_clients_tel on public.resa_clients(etablissement_id, telephone_cle) where telephone_cle is not null;
-- Un e-mail = une fiche (hors fiches archivées) : c'est la clé la plus sûre.
create unique index if not exists uq_resa_clients_email on public.resa_clients(etablissement_id, email_cle)
  where email_cle is not null and not archive;
create unique index if not exists uq_resa_clients_token on public.resa_clients(desinscription_token);

alter table public.resa_clients enable row level security;
revoke all on table public.resa_clients from anon;

drop policy if exists resa_clients_select on public.resa_clients;
create policy resa_clients_select on public.resa_clients
  for select to authenticated
  using (user_can_access_etab(etablissement_id));

drop policy if exists resa_clients_insert on public.resa_clients;
create policy resa_clients_insert on public.resa_clients
  for insert to authenticated
  with check (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('previsions', array['consultant', 'patron', 'resp_cuisine', 'hote']))
  );

drop policy if exists resa_clients_update on public.resa_clients;
create policy resa_clients_update on public.resa_clients
  for update to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('previsions', array['consultant', 'patron', 'resp_cuisine', 'hote']))
  )
  with check (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('previsions', array['consultant', 'patron', 'resp_cuisine', 'hote']))
  );

-- Pas de suppression depuis l'app : une fiche s'archive (son historique et
-- son consentement restent traçables).
drop policy if exists resa_clients_delete on public.resa_clients;
create policy resa_clients_delete on public.resa_clients
  for delete to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select public.current_user_role()) = 'consultant'
  );

-- ── 2. La réservation pointe vers sa fiche ──────────────────────────────────
alter table public.reservations
  add column if not exists client_id text references public.resa_clients(id) on delete set null;
create index if not exists idx_reservations_client on public.reservations(client_id) where client_id is not null;

-- ── 3. Rattachement automatique ─────────────────────────────────────────────
-- Avant chaque réservation créée (ou dont l'e-mail / le téléphone change) et
-- sans client : la fiche du même e-mail, sinon du même téléphone, sinon une
-- nouvelle fiche. Une fiche trouvée reçoit le contact qui lui manquait.
-- client_id fourni explicitement (rattachement choisi à la main) : respecté.
-- SECURITY DEFINER : la réservation en ligne arrive par le service role, la
-- saisie manuelle par l'équipe ; les deux doivent pouvoir créer la fiche.
create or replace function public.resa_rattacher_client()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_email text;
  v_tel   text;
  v_tel_brut text;
  v_id    text;
begin
  if new.client_id is not null then return new; end if;

  v_email := nullif(lower(btrim(coalesce(new.email, ''))), '');
  v_tel_brut := nullif(btrim(coalesce(new.telephone, '')), '');
  v_tel := case when length(regexp_replace(coalesce(v_tel_brut, ''), '\D', '', 'g')) >= 6
                then right(regexp_replace(v_tel_brut, '\D', '', 'g'), 9) end;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then v_email := null; end if;
  if v_email is null and v_tel is null then return new; end if;

  begin
    if v_email is not null then
      select id into v_id from public.resa_clients
       where etablissement_id = new.etablissement_id and email_cle = v_email and not archive
       order by created_at limit 1;
    end if;
    if v_id is null and v_tel is not null then
      select id into v_id from public.resa_clients
       where etablissement_id = new.etablissement_id and telephone_cle = v_tel and not archive
       order by created_at limit 1;
    end if;

    if v_id is null then
      insert into public.resa_clients (etablissement_id, nom, email, telephone, created_by)
      values (new.etablissement_id, coalesce(nullif(btrim(new.nom), ''), 'Client'), v_email, v_tel_brut,
              (select auth.uid())::text)
      returning id into v_id;
    else
      -- Contact manquant complété, sans jamais voler l'e-mail d'une autre fiche.
      update public.resa_clients c set
        email = case when c.email is null and v_email is not null
                       and not exists (select 1 from public.resa_clients d
                                        where d.etablissement_id = c.etablissement_id
                                          and d.email_cle = v_email and not d.archive)
                     then v_email else c.email end,
        telephone = coalesce(c.telephone, v_tel_brut),
        updated_at = now()
       where c.id = v_id
         and ((c.email is null and v_email is not null) or (c.telephone is null and v_tel_brut is not null));
    end if;
    new.client_id := v_id;
  exception when others then
    -- La réservation passe avant la fiche : elle est gardée sans client.
    raise warning '[resa_rattacher_client] réservation % gardée sans client : %', new.id, sqlerrm;
    new.client_id := null;
  end;
  return new;
end
$function$;

revoke all on function public.resa_rattacher_client() from public, anon, authenticated;

drop trigger if exists trg_reservations_rattacher_client on public.reservations;
create trigger trg_reservations_rattacher_client
  before insert or update of email, telephone on public.reservations
  for each row execute function public.resa_rattacher_client();

-- ── 4. Chiffres d'une fiche ─────────────────────────────────────────────────
-- security_invoker : la vue lit avec les droits de l'appelant (RLS des deux
-- tables), jamais avec ceux de son propriétaire.
create or replace view public.resa_clients_stats
with (security_invoker = true)
as
select
  c.id as client_id,
  c.etablissement_id,
  count(r.id) filter (where r.statut <> 'annule')                                         as nb_reservations,
  count(r.id) filter (where r.statut in ('confirme', 'arrive', 'parti') and r.date_service <= current_date) as nb_venues,
  count(r.id) filter (where r.statut = 'no_show')                                         as nb_no_show,
  max(r.date_service) filter (where r.statut in ('confirme', 'arrive', 'parti') and r.date_service <= current_date) as derniere_venue,
  min(r.date_service) filter (where r.statut in ('confirme', 'demande') and r.date_service >= current_date)          as prochaine,
  coalesce(sum(r.nb_couverts) filter (where r.statut in ('confirme', 'arrive', 'parti') and r.date_service <= current_date), 0) as couverts_total
from public.resa_clients c
left join public.reservations r on r.client_id = c.id
group by c.id, c.etablissement_id;

revoke all on public.resa_clients_stats from anon;
grant select on public.resa_clients_stats to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (à exécuter à la main si besoin) :
--   drop trigger if exists trg_reservations_rattacher_client on public.reservations;
--   drop function if exists public.resa_rattacher_client();
--   drop view if exists public.resa_clients_stats;
--   alter table public.reservations drop column if exists client_id;
--   drop table if exists public.resa_clients;
-- Un front qui lit client_id / resa_clients doit être retiré AVANT (contract).
-- ════════════════════════════════════════════════════════════════════════════
