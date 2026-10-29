-- ════════════════════════════════════════════════════════════════════════════
-- Contrats de travail, et motifs d'absence « vacances » et « jour férié »
-- ───────────────────────────────────────────────────────────────────────────
-- La direction lit chaque mois le solde d'heures de chaque personne contre son
-- contrat (taux, heures par semaine), ses retards et ses absences. Le contrat
-- vit par établissement : une même personne peut en avoir un par maison, et
-- plusieurs à la suite dans une maison (changement de taux), bornés par début
-- et fin.
--
-- Lecture : la personne elle-même (son contrat seulement), et qui gère le
-- Planning de l'établissement. Écriture : qui gère le Planning, pour une
-- personne rattachée à l'établissement. Aucun accès anon.
--
-- Absences : la contrainte de motif est élargie (expand), aucune ligne
-- existante n'est modifiée ; les lignes « conge » restent « conge ».
--
-- Migration additive, idempotente. Inverse : 20261030_contrats_travail.rollback.sql.
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Table
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.contrats_travail (
  id               text        primary key default (gen_random_uuid())::text,
  etablissement_id text        not null references public.etablissements(id) on delete cascade,
  profile_id       text        not null references public.profiles(id) on delete cascade,
  taux             numeric     not null default 100 check (taux > 0 and taux <= 100),
  heures_semaine   numeric     not null default 42 check (heures_semaine > 0 and heures_semaine <= 60),
  vacances_jours   numeric     not null default 25 check (vacances_jours >= 0),
  debut            date        not null,
  fin              date        null,
  note             text        null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       text        default (auth.uid())::text,
  constraint contrats_travail_dates_ordonnees check (fin is null or fin >= debut)
);

create index if not exists idx_contrats_travail_etab
  on public.contrats_travail(etablissement_id);
create index if not exists idx_contrats_travail_profile
  on public.contrats_travail(profile_id);

-- updated_at : fonction set_updated_at() déjà en base (migration 20260715_kds_orders).
create or replace trigger trg_contrats_travail_updated_at
  before update on public.contrats_travail
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RLS
-- ─────────────────────────────────────────────────────────────────────────────
-- Données de personnel : aucun droit hérité (TRUNCATE ignore la RLS). La
-- personne et l'établissement d'un contrat ne changent jamais : la mise à jour
-- ne porte que sur les colonnes du contrat (clore un contrat reste possible
-- après le départ de la personne, sans relire son profil).
alter table public.contrats_travail enable row level security;
revoke all on public.contrats_travail from public, anon, authenticated;
grant select, insert, delete on public.contrats_travail to authenticated;
grant update (taux, heures_semaine, vacances_jours, debut, fin, note)
  on public.contrats_travail to authenticated;

drop policy if exists contrats_travail_select on public.contrats_travail;
create policy contrats_travail_select on public.contrats_travail
  for select to authenticated
  using (
    profile_id = (select auth.uid())::text
    or (
      user_can_access_etab(etablissement_id)
      and (select public.user_peut_gerer('planning', array['consultant','patron','resp_cuisine']))
    )
  );

-- Création : pour une personne rattachée à l'établissement, au nom de qui crée.
drop policy if exists contrats_travail_insert on public.contrats_travail;
create policy contrats_travail_insert on public.contrats_travail
  for insert to authenticated
  with check (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('planning', array['consultant','patron','resp_cuisine']))
    and created_by is not distinct from (select auth.uid())::text
    and exists (
      select 1 from public.profiles p
      where p.id = contrats_travail.profile_id
        and contrats_travail.etablissement_id = any(p.etablissement_ids)
    )
  );

drop policy if exists contrats_travail_update on public.contrats_travail;
create policy contrats_travail_update on public.contrats_travail
  for update to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('planning', array['consultant','patron','resp_cuisine']))
  )
  with check (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('planning', array['consultant','patron','resp_cuisine']))
  );

drop policy if exists contrats_travail_delete on public.contrats_travail;
create policy contrats_travail_delete on public.contrats_travail
  for delete to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('planning', array['consultant','patron','resp_cuisine']))
  );

-- Un seul contrat ouvert par personne et par maison : le solde ne compte
-- jamais deux fois le même jour. On clôt l'ancien avant d'ouvrir le suivant.
create unique index if not exists uq_contrats_travail_ouvert
  on public.contrats_travail(profile_id, etablissement_id)
  where fin is null;

comment on table public.contrats_travail is
  'Contrat de travail d''une personne dans un établissement (taux, heures par semaine, vacances, début, fin). Sert au solde d''heures mensuel du Planning. Lecture : la personne et qui gère le Planning.';
comment on column public.contrats_travail.note is
  'Visible par la personne concernée. Pas de donnée de santé ni d''appréciation.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Absences : motifs « vacances » et « ferie » (expand)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.absences drop constraint if exists absences_motif_check;
alter table public.absences add constraint absences_motif_check
  check (motif in ('conge', 'formation', 'absence', 'vacances', 'ferie'));
