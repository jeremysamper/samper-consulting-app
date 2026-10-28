-- ════════════════════════════════════════════════════════════════════════════
-- Branche Hôtel, lot H6 : communication d'équipe
-- ───────────────────────────────────────────────────────────────────────────
-- Cinq tables neuves, expand only :
--   passations           le cahier de passation d'un pôle : par jour et par
--                        service (matin, après-midi, soir, nuit), un texte, un
--                        drapeau important, l'auteur.
--   passation_lectures   qui a lu quelle passation, et quand (une ligne par
--                        personne et par passation).
--   canaux_messages      les messages d'un canal de pôle (ou « tous »), avec
--                        les personnes mentionnées.
--   taches_recurrentes   les tâches qui reviennent (chaque jour, un jour de la
--                        semaine, un jour du mois) pour un pôle, à une heure.
--   taches_faites        la trace d'une tâche faite un jour donné, par qui.
-- Les pôles sont ceux des demandes (lot H2) : réception, étages, technique,
-- cuisine, restaurant, spa, direction, plus « tous » pour les canaux.
--
-- Droits : toute l'équipe de l'établissement lit, écrit une passation ou un
-- message, marque une passation lue, coche une tâche ; chacun corrige son
-- propre texte ; les tâches récurrentes et les suppressions passent par la
-- case Modifier de Passations (consultant, patron, réception, gouvernante,
-- responsable de cuisine par défaut). anon exclu : aucune policy.
-- Idempotente. Inverse : migrations-inverse/20261028_hotel_h6.sql.
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tables
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.passations (
  id                  uuid        primary key default gen_random_uuid(),
  etablissement_id    text        not null references public.etablissements(id) on delete cascade,
  pole                text        not null check (pole in ('reception', 'etages', 'technique', 'cuisine', 'restaurant', 'spa', 'direction')),
  jour                date        not null,
  service             text        not null default 'matin' check (service in ('matin', 'apres_midi', 'soir', 'nuit')),
  contenu             text        not null check (btrim(contenu) <> ''),
  important           boolean     not null default false,
  created_by          text        references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_passations_etab_jour on public.passations(etablissement_id, jour desc, pole);
create index if not exists idx_passations_created_by on public.passations(created_by);

create table if not exists public.passation_lectures (
  id                  uuid        primary key default gen_random_uuid(),
  etablissement_id    text        not null references public.etablissements(id) on delete cascade,
  passation_id        uuid        not null references public.passations(id) on delete cascade,
  user_id             text        not null references public.profiles(id) on delete cascade,
  at                  timestamptz not null default now(),
  constraint uq_passation_lectures unique (passation_id, user_id)
);
create index if not exists idx_passation_lectures_user on public.passation_lectures(user_id);
create index if not exists idx_passation_lectures_etab on public.passation_lectures(etablissement_id);

create table if not exists public.canaux_messages (
  id                  uuid        primary key default gen_random_uuid(),
  etablissement_id    text        not null references public.etablissements(id) on delete cascade,
  canal               text        not null check (canal in ('tous', 'reception', 'etages', 'technique', 'cuisine', 'restaurant', 'spa', 'direction')),
  contenu             text        not null check (btrim(contenu) <> ''),
  mentions            text[]      not null default '{}',
  created_by          text        references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_canaux_messages_etab_canal on public.canaux_messages(etablissement_id, canal, created_at desc);
create index if not exists idx_canaux_messages_created_by on public.canaux_messages(created_by);
create index if not exists idx_canaux_messages_mentions on public.canaux_messages using gin (mentions);

create table if not exists public.taches_recurrentes (
  id                  uuid        primary key default gen_random_uuid(),
  etablissement_id    text        not null references public.etablissements(id) on delete cascade,
  pole                text        not null check (pole in ('reception', 'etages', 'technique', 'cuisine', 'restaurant', 'spa', 'direction')),
  titre               text        not null check (btrim(titre) <> ''),
  detail              text,
  recurrence          text        not null default 'quotidien' check (recurrence in ('quotidien', 'hebdomadaire', 'mensuel')),
  jour_semaine        int         check (jour_semaine is null or jour_semaine between 1 and 7),
  jour_mois           int         check (jour_mois is null or jour_mois between 1 and 31),
  heure               time,
  actif               boolean     not null default true,
  ordre               int         not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint taches_recurrentes_regle check (
    (recurrence = 'quotidien')
    or (recurrence = 'hebdomadaire' and jour_semaine is not null)
    or (recurrence = 'mensuel' and jour_mois is not null)
  )
);
create index if not exists idx_taches_recurrentes_etab on public.taches_recurrentes(etablissement_id, pole, ordre);

create table if not exists public.taches_faites (
  id                  uuid        primary key default gen_random_uuid(),
  etablissement_id    text        not null references public.etablissements(id) on delete cascade,
  tache_id            uuid        not null references public.taches_recurrentes(id) on delete cascade,
  jour                date        not null,
  fait_par            text        references public.profiles(id) on delete set null,
  at                  timestamptz not null default now(),
  constraint uq_taches_faites unique (tache_id, jour)
);
create index if not exists idx_taches_faites_etab_jour on public.taches_faites(etablissement_id, jour);
create index if not exists idx_taches_faites_fait_par on public.taches_faites(fait_par);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Déclencheurs
-- ─────────────────────────────────────────────────────────────────────────────
create or replace trigger trg_passations_updated_at
  before update on public.passations
  for each row execute function public.set_updated_at();
create or replace trigger trg_canaux_messages_updated_at
  before update on public.canaux_messages
  for each row execute function public.set_updated_at();
create or replace trigger trg_taches_recurrentes_updated_at
  before update on public.taches_recurrentes
  for each row execute function public.set_updated_at();

-- Cohérence : établissement fixe ; ce qu'une ligne référence est de son
-- établissement ; l'auteur (created_by, user_id, fait_par) est le compte
-- connecté, immuable sauf effacement par la suppression de son profil ; les
-- personnes mentionnées sont de l'établissement.
create or replace function public.hotel_h6_coherence()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  ancien text;
  nouveau text;
begin
  if tg_op = 'UPDATE' and new.etablissement_id <> old.etablissement_id then
    raise exception 'ETABLISSEMENT_FIXE: une ligne ne change pas d''établissement' using errcode = '23514';
  end if;

  -- Les horodatages sont posés par la base : un « lu » ou un « fait » ne s'antidate pas.
  if tg_table_name in ('passation_lectures', 'taches_faites') then
    if tg_op = 'INSERT' then
      if (select auth.uid()) is not null then new.at := now(); end if;
    else
      new.at := old.at;
    end if;
  elsif tg_op = 'INSERT' then
    if (select auth.uid()) is not null then new.created_at := now(); end if;
  else
    new.created_at := old.created_at;
  end if;

  if tg_table_name = 'passation_lectures' then
    if not exists (select 1 from public.passations p where p.id = new.passation_id and p.etablissement_id = new.etablissement_id) then
      raise exception 'PASSATION_INCONNUE: la passation n''appartient pas à cet établissement' using errcode = '23503';
    end if;
    if (select auth.uid()) is not null then
      new.user_id := (select auth.uid())::text;
    end if;
    return new;
  end if;

  if tg_table_name = 'taches_faites' then
    if not exists (select 1 from public.taches_recurrentes t where t.id = new.tache_id and t.etablissement_id = new.etablissement_id) then
      raise exception 'TACHE_INCONNUE: la tâche n''appartient pas à cet établissement' using errcode = '23503';
    end if;
    nouveau := new.fait_par;
    ancien := case when tg_op = 'UPDATE' then old.fait_par end;
  elsif tg_table_name = 'taches_recurrentes' then
    return new;
  else
    nouveau := new.created_by;
    ancien := case when tg_op = 'UPDATE' then old.created_by end;
  end if;

  if tg_table_name = 'canaux_messages' then
    -- Les mentions ne sont revérifiées que quand elles changent.
    if (tg_op = 'INSERT' or new.mentions is distinct from old.mentions) and exists (
      select 1 from unnest(new.mentions) m
      where not exists (select 1 from public.profiles p where p.id = m and new.etablissement_id = any (p.etablissement_ids))
    ) then
      raise exception 'MENTION_INCONNUE: une personne mentionnée n''appartient pas à cet établissement' using errcode = '23503';
    end if;
  end if;

  if tg_op = 'INSERT' then
    if (select auth.uid()) is not null then nouveau := (select auth.uid())::text; end if;
  elsif nouveau is distinct from ancien and (select auth.uid()) is not null
     and (nouveau is not null or exists (select 1 from public.profiles p where p.id = ancien)) then
    nouveau := ancien;
  end if;
  if tg_table_name = 'taches_faites' then new.fait_par := nouveau; else new.created_by := nouveau; end if;
  return new;
end;
$$;

revoke all on function public.hotel_h6_coherence() from public, anon, authenticated;

create or replace trigger trg_passations_coherence
  before insert or update on public.passations
  for each row execute function public.hotel_h6_coherence();
create or replace trigger trg_passation_lectures_coherence
  before insert or update on public.passation_lectures
  for each row execute function public.hotel_h6_coherence();
create or replace trigger trg_canaux_messages_coherence
  before insert or update on public.canaux_messages
  for each row execute function public.hotel_h6_coherence();
create or replace trigger trg_taches_recurrentes_coherence
  before insert or update on public.taches_recurrentes
  for each row execute function public.hotel_h6_coherence();
create or replace trigger trg_taches_faites_coherence
  before insert or update on public.taches_faites
  for each row execute function public.hotel_h6_coherence();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RLS
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  t text;
  gerer text := '(select public.user_peut_gerer(''passations'', array[''consultant'', ''patron'', ''receptionniste'', ''gouvernante'', ''resp_cuisine'']))';
  auteur text := 'created_by = (select auth.uid())::text';
begin
  foreach t in array array['passations', 'passation_lectures', 'canaux_messages', 'taches_recurrentes', 'taches_faites'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    -- Lectures et tâches faites : jamais de mise à jour (on insère, on retire).
    if t in ('passation_lectures', 'taches_faites') then
      execute format('grant select, insert, delete on table public.%I to authenticated', t);
    else
      execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    end if;
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (user_can_access_etab(etablissement_id))', t || '_select', t);
  end loop;

  -- Passations et messages : l'équipe écrit ; chacun corrige son texte, la
  -- case Modifier corrige et supprime tout.
  foreach t in array array['passations', 'canaux_messages'] loop
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_can_access_etab(etablissement_id))', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update to authenticated using (user_can_access_etab(etablissement_id) and (%s or %s)) with check (user_can_access_etab(etablissement_id) and (%s or %s))', t || '_update', t, auteur, gerer, auteur, gerer);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for delete to authenticated using (user_can_access_etab(etablissement_id) and (%s or %s))', t || '_delete', t, auteur, gerer);
  end loop;

  -- Lectures et tâches faites : chacun pour soi ; la case Modifier retire.
  execute 'drop policy if exists passation_lectures_insert on public.passation_lectures';
  execute 'create policy passation_lectures_insert on public.passation_lectures for insert to authenticated with check (user_can_access_etab(etablissement_id))';
  execute 'drop policy if exists passation_lectures_delete on public.passation_lectures';
  execute format('create policy passation_lectures_delete on public.passation_lectures for delete to authenticated using (user_can_access_etab(etablissement_id) and (user_id = (select auth.uid())::text or %s))', gerer);
  execute 'drop policy if exists taches_faites_insert on public.taches_faites';
  execute 'create policy taches_faites_insert on public.taches_faites for insert to authenticated with check (user_can_access_etab(etablissement_id))';
  execute 'drop policy if exists taches_faites_delete on public.taches_faites';
  execute format('create policy taches_faites_delete on public.taches_faites for delete to authenticated using (user_can_access_etab(etablissement_id) and (fait_par = (select auth.uid())::text or %s))', gerer);

  -- Tâches récurrentes : la case Modifier.
  execute 'drop policy if exists taches_recurrentes_insert on public.taches_recurrentes';
  execute format('create policy taches_recurrentes_insert on public.taches_recurrentes for insert to authenticated with check (user_can_access_etab(etablissement_id) and %s)', gerer);
  execute 'drop policy if exists taches_recurrentes_update on public.taches_recurrentes';
  execute format('create policy taches_recurrentes_update on public.taches_recurrentes for update to authenticated using (user_can_access_etab(etablissement_id) and %s) with check (user_can_access_etab(etablissement_id) and %s)', gerer, gerer);
  execute 'drop policy if exists taches_recurrentes_delete on public.taches_recurrentes';
  execute format('create policy taches_recurrentes_delete on public.taches_recurrentes for delete to authenticated using (user_can_access_etab(etablissement_id) and %s)', gerer);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Realtime
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['passations', 'passation_lectures', 'canaux_messages', 'taches_recurrentes', 'taches_faites'] loop
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
comment on table public.passations is 'Cahier de passation par pôle (lot H6) : jour, service, texte, important, auteur.';
comment on table public.passation_lectures is 'Qui a lu quelle passation (lot H6), une ligne par personne.';
comment on table public.canaux_messages is 'Messages des canaux de pôle (lot H6), avec les personnes mentionnées.';
comment on table public.taches_recurrentes is 'Tâches récurrentes d''un pôle (lot H6) : chaque jour, un jour de la semaine ou du mois, à une heure.';
comment on table public.taches_faites is 'Tâche récurrente faite un jour donné (lot H6), par qui.';
