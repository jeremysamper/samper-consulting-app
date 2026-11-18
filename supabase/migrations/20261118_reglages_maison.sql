-- ─────────────────────────────────────────────────────────────────────────────
-- Réglages de la maison (18.11.2026)
--
--   reglages_maison   une ligne par établissement, deux blocs jsonb :
--     fermetures      jours fermés de la semaine, services fermés par jour,
--                     périodes de fermeture datées (vacances, travaux)
--     pointage        règles de calcul des heures pointées (arrondi, arrivée
--                     en avance) ; le pointage brut n'est jamais réécrit
--
--   objectifs_maison  une ligne par établissement : coût matière, coût du
--                     personnel et chiffre visés, tracés dans Statistiques.
--                     Table à part parce que lue par la direction seule (le
--                     coût du personnel est réservé à la direction) : une
--                     personne de l'équipe n'en lit aucune ligne.
--
-- Ajout seul (expand) : aucune table existante n'est touchée, le front déployé
-- n'en lit rien. Une ligne absente vaut les valeurs par défaut du front.
-- reglages_maison : lue par l'équipe de l'établissement, écrite par consultant
-- et patron, comme hotel_reglages. objectifs_maison : lue et écrite par
-- consultant et patron seuls. Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.reglages_maison (
  etablissement_id  text        primary key references public.etablissements(id) on delete cascade,
  fermetures        jsonb       not null default '{}'::jsonb check (jsonb_typeof(fermetures) = 'object'),
  pointage          jsonb       not null default '{}'::jsonb check (jsonb_typeof(pointage) = 'object'),
  updated_at        timestamptz not null default now()
);

create table if not exists public.objectifs_maison (
  etablissement_id  text        primary key references public.etablissements(id) on delete cascade,
  objectifs         jsonb       not null default '{}'::jsonb check (jsonb_typeof(objectifs) = 'object'),
  updated_at        timestamptz not null default now()
);

-- Une première version de ce fichier (jamais appliquée en production) portait
-- les objectifs dans reglages_maison : s'ils y sont, ils passent dans leur
-- table, puis la colonne part. Sans elle, rien ne se passe.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reglages_maison' and column_name = 'objectifs'
  ) then
    execute 'insert into public.objectifs_maison (etablissement_id, objectifs)
             select etablissement_id, objectifs from public.reglages_maison
             where objectifs is not null and objectifs <> ''{}''::jsonb
             on conflict (etablissement_id) do nothing';
    alter table public.reglages_maison drop column objectifs;
  end if;
end $$;

create or replace trigger trg_objectifs_maison_updated_at
  before update on public.objectifs_maison
  for each row execute function public.set_updated_at();

alter table public.objectifs_maison enable row level security;
revoke all on table public.objectifs_maison from public, anon, authenticated;
grant select, insert, update, delete on table public.objectifs_maison to authenticated;

drop policy if exists objectifs_maison_select on public.objectifs_maison;
create policy objectifs_maison_select on public.objectifs_maison
  for select to authenticated
  using (user_can_access_etab(etablissement_id) and (select public.current_user_role()) in ('consultant', 'patron'));

drop policy if exists objectifs_maison_insert on public.objectifs_maison;
create policy objectifs_maison_insert on public.objectifs_maison
  for insert to authenticated
  with check (user_can_access_etab(etablissement_id) and (select public.current_user_role()) in ('consultant', 'patron'));

drop policy if exists objectifs_maison_update on public.objectifs_maison;
create policy objectifs_maison_update on public.objectifs_maison
  for update to authenticated
  using (user_can_access_etab(etablissement_id) and (select public.current_user_role()) in ('consultant', 'patron'))
  with check (user_can_access_etab(etablissement_id) and (select public.current_user_role()) in ('consultant', 'patron'));

drop policy if exists objectifs_maison_delete on public.objectifs_maison;
create policy objectifs_maison_delete on public.objectifs_maison
  for delete to authenticated
  using (user_can_access_etab(etablissement_id) and (select public.current_user_role()) in ('consultant', 'patron'));

create or replace trigger trg_reglages_maison_updated_at
  before update on public.reglages_maison
  for each row execute function public.set_updated_at();

alter table public.reglages_maison enable row level security;
revoke all on table public.reglages_maison from public, anon, authenticated;
grant select, insert, update, delete on table public.reglages_maison to authenticated;

drop policy if exists reglages_maison_select on public.reglages_maison;
create policy reglages_maison_select on public.reglages_maison
  for select to authenticated
  using (user_can_access_etab(etablissement_id));

drop policy if exists reglages_maison_insert on public.reglages_maison;
create policy reglages_maison_insert on public.reglages_maison
  for insert to authenticated
  with check (user_can_access_etab(etablissement_id) and (select public.current_user_role()) in ('consultant', 'patron'));

drop policy if exists reglages_maison_update on public.reglages_maison;
create policy reglages_maison_update on public.reglages_maison
  for update to authenticated
  using (user_can_access_etab(etablissement_id) and (select public.current_user_role()) in ('consultant', 'patron'))
  with check (user_can_access_etab(etablissement_id) and (select public.current_user_role()) in ('consultant', 'patron'));

drop policy if exists reglages_maison_delete on public.reglages_maison;
create policy reglages_maison_delete on public.reglages_maison
  for delete to authenticated
  using (user_can_access_etab(etablissement_id) and (select public.current_user_role()) in ('consultant', 'patron'));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reglages_maison'
  ) then
    alter publication supabase_realtime add table public.reglages_maison;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'objectifs_maison'
  ) then
    alter publication supabase_realtime add table public.objectifs_maison;
  end if;
end $$;

comment on table public.reglages_maison is
  'Réglages de la maison (18.11.2026) : fermetures, règles de calcul du pointage. Une ligne par établissement ; ligne absente = valeurs par défaut du front.';
comment on table public.objectifs_maison is
  'Objectifs de la maison (18.11.2026) : coût matière, coût du personnel et chiffre visés. Direction seule (consultant, patron), en lecture comme en écriture.';
