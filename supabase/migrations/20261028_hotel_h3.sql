-- ════════════════════════════════════════════════════════════════════════════
-- Branche Hôtel, lot H3 : fiche hôte unique
-- ───────────────────────────────────────────────────────────────────────────
-- Une fiche par hôte de l'hôtel (profil, langue, allergies, préférences,
-- occasions, VIP, notes, consentement nLPD daté), liée à ses séjours et, quand
-- la même personne existe dans le fichier clients du restaurant (resa_clients)
-- ou du spa (spa_clients), à ces fiches-là. Rien n'est fusionné ni déplacé :
-- les deux fichiers existants restent tels quels, la fiche hôte les relie
-- (expand only). sejours reçoit une colonne nullable hote_id (table du lot H0).
--
-- Droits : lecture par l'équipe de l'établissement ; création et modification
-- avec la case Modifier d'Hébergement (consultant, patron, réception) ;
-- suppression réservée au consultant (une fiche s'archive, son consentement
-- reste traçable), comme resa_clients.
-- Idempotente. Inverse : migrations-inverse/20261028_hotel_h3.sql.
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Correction du lot H2 (revue de sécurité) : l'auteur d'une demande ne peut
--    être effacé que par la suppression de son profil (on delete set null),
--    jamais par une mise à jour d'un compte connecté.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.demandes_avant_ecriture()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.chambre_id is not null and not exists (
    select 1 from public.chambres c where c.id = new.chambre_id and c.etablissement_id = new.etablissement_id
  ) then
    raise exception 'CHAMBRE_INCONNUE: la chambre n''appartient pas à cet établissement' using errcode = '23503';
  end if;
  if new.sejour_id is not null and not exists (
    select 1 from public.sejours s where s.id = new.sejour_id and s.etablissement_id = new.etablissement_id
  ) then
    raise exception 'SEJOUR_INCONNU: le séjour n''appartient pas à cet établissement' using errcode = '23503';
  end if;
  if new.assignee_a is not null and not exists (
    select 1 from public.profiles p where p.id = new.assignee_a and new.etablissement_id = any (p.etablissement_ids)
  ) then
    raise exception 'ASSIGNEE_INCONNU: la personne n''appartient pas à cet établissement' using errcode = '23503';
  end if;
  if tg_op = 'INSERT' then
    if (select auth.uid()) is not null then
      new.cree_par := (select auth.uid())::text;
    end if;
  else
    -- L'auteur ne se réécrit pas, et ne s'efface que si son profil a disparu.
    if new.cree_par is distinct from old.cree_par and (select auth.uid()) is not null
       and (new.cree_par is not null or exists (select 1 from public.profiles p where p.id = old.cree_par)) then
      new.cree_par := old.cree_par;
    end if;
  end if;
  if tg_op = 'UPDATE' and new.etablissement_id <> old.etablissement_id then
    raise exception 'DEMANDE_ETABLISSEMENT_FIXE: une demande ne change pas d''établissement' using errcode = '23514';
  end if;
  if new.statut = 'faite' and (tg_op = 'INSERT' or old.statut <> 'faite') then
    new.faite_at := coalesce(new.faite_at, now());
    if (select auth.uid()) is not null then
      new.faite_par := (select auth.uid())::text;
    end if;
  elsif tg_op = 'UPDATE' and new.statut = 'faite' then
    new.faite_par := old.faite_par;
    new.faite_at := old.faite_at;
  end if;
  if new.statut <> 'faite' then
    new.faite_at := null;
    new.faite_par := null;
  end if;
  if new.escaladee and (tg_op = 'INSERT' or not old.escaladee) then
    new.escaladee_at := coalesce(new.escaladee_at, now());
  end if;
  if not new.escaladee then
    new.escaladee_at := null;
  end if;
  return new;
end;
$$;

revoke all on function public.demandes_avant_ecriture() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Table
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.hotes (
  id                     uuid        primary key default gen_random_uuid(),
  etablissement_id       text        not null references public.etablissements(id) on delete cascade,
  prenom                 text,
  nom                    text,
  email                  text,
  telephone              text,
  langue                 text        not null default 'fr' check (langue in ('fr', 'de', 'it', 'en', 'es', 'autre')),
  date_naissance         date        check (date_naissance is null or date_naissance >= date '1900-01-01'),
  nationalite            text,
  allergies              text,
  preferences            text,
  occasions              text,
  vip                    boolean     not null default false,
  notes                  text,
  consentement_marketing boolean     not null default false,
  consentement_at        timestamptz,
  consentement_source    text        check (consentement_source is null or consentement_source in ('en_ligne', 'equipe')),
  desinscrit_at          timestamptz,
  resa_client_id         text        references public.resa_clients(id) on delete set null,
  spa_client_id          text        references public.spa_clients(id) on delete set null,
  archive                boolean     not null default false,
  created_by             text        references public.profiles(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  email_cle              text generated always as (nullif(lower(btrim(coalesce(email, ''))), '')) stored,
  telephone_cle          text generated always as (
    case when length(regexp_replace(coalesce(telephone, ''), '\D', '', 'g')) >= 6
         then right(regexp_replace(coalesce(telephone, ''), '\D', '', 'g'), 9) end
  ) stored,
  constraint hotes_identite check (btrim(coalesce(prenom, '') || coalesce(nom, '')) <> ''),
  constraint hotes_email_forme check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

create index if not exists idx_hotes_etab on public.hotes(etablissement_id, nom, prenom);
create index if not exists idx_hotes_tel on public.hotes(etablissement_id, telephone_cle) where telephone_cle is not null;
create unique index if not exists uq_hotes_email on public.hotes(etablissement_id, email_cle) where email_cle is not null and not archive;
create index if not exists idx_hotes_resa_client on public.hotes(resa_client_id);
create index if not exists idx_hotes_spa_client on public.hotes(spa_client_id);
create index if not exists idx_hotes_created_by on public.hotes(created_by);

alter table public.sejours add column if not exists hote_id uuid references public.hotes(id) on delete set null;
create index if not exists idx_sejours_hote on public.sejours(hote_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Déclencheurs
-- ─────────────────────────────────────────────────────────────────────────────
create or replace trigger trg_hotes_updated_at
  before update on public.hotes
  for each row execute function public.set_updated_at();

-- Cohérence : les fiches restaurant et spa liées sont de l'établissement ;
-- l'établissement d'une fiche ne change pas ; le consentement est daté quand
-- il est donné et sa date effacée quand il est retiré.
create or replace function public.hotes_avant_ecriture()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and new.etablissement_id <> old.etablissement_id then
    raise exception 'HOTE_ETABLISSEMENT_FIXE: une fiche hôte ne change pas d''établissement' using errcode = '23514';
  end if;
  if new.resa_client_id is not null and not exists (
    select 1 from public.resa_clients r where r.id = new.resa_client_id and r.etablissement_id = new.etablissement_id
  ) then
    raise exception 'CLIENT_INCONNU: la fiche restaurant n''appartient pas à cet établissement' using errcode = '23503';
  end if;
  if new.spa_client_id is not null and not exists (
    select 1 from public.spa_clients s where s.id = new.spa_client_id and s.etablissement_id = new.etablissement_id
  ) then
    raise exception 'CLIENT_SPA_INCONNU: la fiche spa n''appartient pas à cet établissement' using errcode = '23503';
  end if;
  if new.consentement_marketing and (tg_op = 'INSERT' or not old.consentement_marketing) then
    new.consentement_at := coalesce(new.consentement_at, now());
    new.consentement_source := coalesce(new.consentement_source, 'equipe');
    new.desinscrit_at := null;
  end if;
  if not new.consentement_marketing then
    new.consentement_at := null;
    new.consentement_source := null;
  end if;
  if tg_op = 'INSERT' and (select auth.uid()) is not null then
    new.created_by := (select auth.uid())::text;
  end if;
  return new;
end;
$$;

revoke all on function public.hotes_avant_ecriture() from public, anon, authenticated;

create or replace trigger trg_hotes_avant_ecriture
  before insert or update on public.hotes
  for each row execute function public.hotes_avant_ecriture();

-- Un séjour ne pointe que vers une fiche hôte de son établissement : ajouté au
-- déclencheur du lot H0 (chevauchement), qui garde le reste de sa logique.
create or replace function public.sejours_sans_chevauchement()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  autre record;
begin
  if new.client_id is not null and not exists (
    select 1 from public.resa_clients r
    where r.id = new.client_id and r.etablissement_id = new.etablissement_id
  ) then
    raise exception 'CLIENT_INCONNU: la fiche client n''appartient pas à cet établissement'
      using errcode = '23503';
  end if;
  if new.hote_id is not null and not exists (
    select 1 from public.hotes h
    where h.id = new.hote_id and h.etablissement_id = new.etablissement_id
  ) then
    raise exception 'HOTE_INCONNU: la fiche hôte n''appartient pas à cet établissement'
      using errcode = '23503';
  end if;
  if new.chambre_id is null then
    return new;
  end if;
  if not exists (
    select 1 from public.chambres c
    where c.id = new.chambre_id and c.etablissement_id = new.etablissement_id
  ) then
    raise exception 'CHAMBRE_INCONNUE: la chambre n''appartient pas à cet établissement'
      using errcode = '23503';
  end if;
  if new.statut not in ('prevu', 'en_maison') then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.chambre_id::text, 0));
  select s.id, s.nom_hote, s.arrivee, s.depart
    into autre
  from public.sejours s
  where s.chambre_id = new.chambre_id
    and s.id <> new.id
    and s.statut in ('prevu', 'en_maison')
    and s.arrivee < new.depart
    and new.arrivee < s.depart
  order by s.arrivee
  limit 1;
  if found then
    raise exception 'SEJOUR_CHEVAUCHEMENT: la chambre est déjà prise du % au % (%)',
      to_char(autre.arrivee, 'DD.MM.YYYY'), to_char(autre.depart, 'DD.MM.YYYY'), autre.nom_hote
      using errcode = '23P01';
  end if;
  return new;
end;
$$;

revoke all on function public.sejours_sans_chevauchement() from public, anon, authenticated;

create or replace trigger trg_sejours_sans_chevauchement
  before insert or update of chambre_id, client_id, hote_id, etablissement_id, arrivee, depart, statut on public.sejours
  for each row execute function public.sejours_sans_chevauchement();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RLS
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.hotes enable row level security;
revoke all on table public.hotes from anon;

drop policy if exists hotes_select on public.hotes;
create policy hotes_select on public.hotes
  for select to authenticated
  using (user_can_access_etab(etablissement_id));

drop policy if exists hotes_insert on public.hotes;
create policy hotes_insert on public.hotes
  for insert to authenticated
  with check (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('hebergement', array['consultant', 'patron', 'receptionniste']))
  );

drop policy if exists hotes_update on public.hotes;
create policy hotes_update on public.hotes
  for update to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('hebergement', array['consultant', 'patron', 'receptionniste']))
  )
  with check (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('hebergement', array['consultant', 'patron', 'receptionniste']))
  );

drop policy if exists hotes_delete on public.hotes;
create policy hotes_delete on public.hotes
  for delete to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select public.current_user_role()) = 'consultant'
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Realtime
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'hotes'
  ) then
    alter publication supabase_realtime add table public.hotes;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Commentaires
-- ─────────────────────────────────────────────────────────────────────────────
comment on table public.hotes is
  'Fiche hôte unique de l''hôtel (lot H3) : profil, langue, allergies, préférences, occasions, VIP, notes, consentement nLPD daté ; liée aux séjours (sejours.hote_id) et aux fiches resa_clients et spa_clients de la même personne, qui restent en place.';
comment on column public.sejours.hote_id is
  'Fiche hôte du séjour (lot H3), facultative.';
