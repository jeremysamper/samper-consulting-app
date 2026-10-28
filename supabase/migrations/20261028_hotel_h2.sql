-- ════════════════════════════════════════════════════════════════════════════
-- Branche Hôtel, lot H2 : demandes interpôles
-- ───────────────────────────────────────────────────────────────────────────
-- Une demande d'un hôte (« un oreiller de plus en 203 ») ou d'un collègue
-- (« la douche de la 105 fuit ») adressée à un pôle (réception, étages,
-- technique, cuisine, restaurant, spa, direction), avec une échéance, une
-- priorité, un statut, une personne chargée, une escalade et un journal.
-- Rattachée à une chambre et à un séjour quand il y en a un : l'historique se
-- lit par chambre et par hôte.
--
-- Droits : toute l'équipe de l'établissement lit, crée et fait avancer les
-- demandes (c'est leur raison d'être : n'importe qui signale, le pôle traite) ;
-- la suppression demande la case Modifier de Demandes (consultant, patron,
-- réception par défaut). Le journal est écrit par déclencheur, lecture seule.
-- Expand only, idempotente. Inverse : migrations-inverse/20261028_hotel_h2.sql.
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tables
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.demandes (
  id               uuid        primary key default gen_random_uuid(),
  etablissement_id text        not null references public.etablissements(id) on delete cascade,
  chambre_id       uuid        references public.chambres(id) on delete set null,
  sejour_id        uuid        references public.sejours(id) on delete set null,
  origine          text        not null default 'hote' check (origine in ('hote', 'collegue')),
  pole             text        not null check (pole in ('reception', 'etages', 'technique', 'cuisine', 'restaurant', 'spa', 'direction')),
  titre            text        not null,
  detail           text,
  photo_url        text,
  priorite         text        not null default 'normale' check (priorite in ('basse', 'normale', 'haute', 'urgente')),
  echeance         timestamptz,
  statut           text        not null default 'ouverte' check (statut in ('ouverte', 'en_cours', 'faite', 'annulee')),
  escaladee        boolean     not null default false,
  escaladee_at     timestamptz,
  assignee_a       text        references public.profiles(id) on delete set null,
  cree_par         text        references public.profiles(id) on delete set null,
  faite_par        text        references public.profiles(id) on delete set null,
  faite_at         timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint demandes_titre_non_vide check (btrim(titre) <> '')
);
create index if not exists idx_demandes_etab_statut on public.demandes(etablissement_id, statut, created_at desc);
create index if not exists idx_demandes_chambre     on public.demandes(chambre_id);
create index if not exists idx_demandes_sejour      on public.demandes(sejour_id);
create index if not exists idx_demandes_assignee    on public.demandes(assignee_a);
create index if not exists idx_demandes_cree_par    on public.demandes(cree_par);
create index if not exists idx_demandes_faite_par   on public.demandes(faite_par);

create table if not exists public.demandes_journal (
  id               uuid        primary key default gen_random_uuid(),
  etablissement_id text        not null references public.etablissements(id) on delete cascade,
  demande_id       uuid        not null references public.demandes(id) on delete cascade,
  action           text        not null check (action in ('creee', 'statut', 'assignation', 'escalade', 'echeance', 'pole')),
  detail           text,
  par              text        references public.profiles(id) on delete set null,
  at               timestamptz not null default now()
);
create index if not exists idx_demandes_journal_demande on public.demandes_journal(demande_id, at desc);
create index if not exists idx_demandes_journal_etab    on public.demandes_journal(etablissement_id);
create index if not exists idx_demandes_journal_par     on public.demandes_journal(par);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Déclencheurs
-- ─────────────────────────────────────────────────────────────────────────────
create or replace trigger trg_demandes_updated_at
  before update on public.demandes
  for each row execute function public.set_updated_at();

-- Cohérence et règles de la demande : chambre et séjour de l'établissement ;
-- faite_par et faite_at posés au passage à « faite » ; escaladee_at posé à
-- l'escalade ; cree_par = le compte connecté à la création.
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
  if tg_op = 'INSERT' then
    if (select auth.uid()) is not null then
      new.cree_par := (select auth.uid())::text;
    end if;
  else
    if new.cree_par is distinct from old.cree_par and (select auth.uid()) is not null then
      new.cree_par := old.cree_par;
    end if;
  end if;
  if new.statut = 'faite' and (tg_op = 'INSERT' or old.statut <> 'faite') then
    new.faite_at := coalesce(new.faite_at, now());
    if (select auth.uid()) is not null then
      new.faite_par := (select auth.uid())::text;
    end if;
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

create or replace trigger trg_demandes_avant_ecriture
  before insert or update on public.demandes
  for each row execute function public.demandes_avant_ecriture();

-- Journal : création, changement de statut, d'assignation, d'échéance, de pôle,
-- escalade. SECURITY DEFINER : le journal n'a aucune politique d'écriture.
create or replace function public.demandes_journal_ecrire()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  qui text := (select p.id from public.profiles p where p.id = auth.uid()::text);
begin
  if tg_op = 'INSERT' then
    insert into public.demandes_journal (etablissement_id, demande_id, action, detail, par)
    values (new.etablissement_id, new.id, 'creee', new.pole, qui);
    return new;
  end if;
  if new.statut is distinct from old.statut then
    insert into public.demandes_journal (etablissement_id, demande_id, action, detail, par)
    values (new.etablissement_id, new.id, 'statut', new.statut, qui);
  end if;
  if new.assignee_a is distinct from old.assignee_a then
    insert into public.demandes_journal (etablissement_id, demande_id, action, detail, par)
    values (new.etablissement_id, new.id, 'assignation', new.assignee_a, qui);
  end if;
  if new.escaladee is distinct from old.escaladee then
    insert into public.demandes_journal (etablissement_id, demande_id, action, detail, par)
    values (new.etablissement_id, new.id, 'escalade', case when new.escaladee then 'oui' else 'non' end, qui);
  end if;
  if new.echeance is distinct from old.echeance then
    insert into public.demandes_journal (etablissement_id, demande_id, action, detail, par)
    values (new.etablissement_id, new.id, 'echeance', new.echeance::text, qui);
  end if;
  if new.pole is distinct from old.pole then
    insert into public.demandes_journal (etablissement_id, demande_id, action, detail, par)
    values (new.etablissement_id, new.id, 'pole', new.pole, qui);
  end if;
  return new;
end;
$$;

revoke all on function public.demandes_journal_ecrire() from public, anon, authenticated;

create or replace trigger trg_demandes_journal
  after insert or update on public.demandes
  for each row execute function public.demandes_journal_ecrire();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RLS
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.demandes         enable row level security;
alter table public.demandes_journal enable row level security;
revoke all on table public.demandes         from anon;
revoke all on table public.demandes_journal from anon;
revoke all on table public.demandes_journal from authenticated;
grant select on table public.demandes_journal to authenticated;

drop policy if exists demandes_select on public.demandes;
create policy demandes_select on public.demandes
  for select to authenticated
  using (user_can_access_etab(etablissement_id));

drop policy if exists demandes_insert on public.demandes;
create policy demandes_insert on public.demandes
  for insert to authenticated
  with check (user_can_access_etab(etablissement_id));

drop policy if exists demandes_update on public.demandes;
create policy demandes_update on public.demandes
  for update to authenticated
  using (user_can_access_etab(etablissement_id))
  with check (user_can_access_etab(etablissement_id));

drop policy if exists demandes_delete on public.demandes;
create policy demandes_delete on public.demandes
  for delete to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('demandes', array['consultant', 'patron', 'receptionniste']))
  );

drop policy if exists demandes_journal_select on public.demandes_journal;
create policy demandes_journal_select on public.demandes_journal
  for select to authenticated
  using (user_can_access_etab(etablissement_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Realtime
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['demandes', 'demandes_journal'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Commentaires
-- ─────────────────────────────────────────────────────────────────────────────
comment on table public.demandes is
  'Demandes interpôles (lot H2) : d''un hôte ou d''un collègue, vers un pôle, avec priorité, échéance, statut, personne chargée, escalade. Lues, créées et avancées par toute l''équipe ; supprimées avec la case Modifier de Demandes.';
comment on table public.demandes_journal is
  'Journal des demandes (lot H2) : création, statut, assignation, escalade, échéance, pôle ; écrit par déclencheur, lecture seule.';
