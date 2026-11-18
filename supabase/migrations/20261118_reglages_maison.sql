-- ─────────────────────────────────────────────────────────────────────────────
-- Réglages de la maison (18.11.2026)
--
--   reglages_maison   une ligne par établissement, quatre blocs jsonb :
--     fermetures      jours fermés de la semaine, services fermés par jour,
--                     périodes de fermeture datées (vacances, travaux)
--     temps_travail   règles du temps de travail contrôlées dans le planning
--                     (repos entre deux journées, pauses de la loi, journée et
--                     semaine maximales, jours de repos par semaine)
--     pointage        règles de calcul des heures pointées (arrondi, arrivée
--                     en avance) ; le pointage brut n'est jamais réécrit
--     objectifs       coût matière, coût du personnel et chiffre visés,
--                     tracés dans Statistiques
--
-- Ajout seul (expand) : aucune table existante n'est touchée, le front déployé
-- n'en lit rien. Une ligne absente vaut les valeurs par défaut du front.
-- Lecture : l'équipe de l'établissement. Écriture : consultant et patron,
-- comme hotel_reglages. Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.reglages_maison (
  etablissement_id  text        primary key references public.etablissements(id) on delete cascade,
  fermetures        jsonb       not null default '{}'::jsonb check (jsonb_typeof(fermetures) = 'object'),
  temps_travail     jsonb       not null default '{}'::jsonb check (jsonb_typeof(temps_travail) = 'object'),
  pointage          jsonb       not null default '{}'::jsonb check (jsonb_typeof(pointage) = 'object'),
  objectifs         jsonb       not null default '{}'::jsonb check (jsonb_typeof(objectifs) = 'object'),
  updated_at        timestamptz not null default now()
);

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
end $$;

comment on table public.reglages_maison is
  'Réglages de la maison (18.11.2026) : fermetures, règles du temps de travail, règles de calcul du pointage, objectifs. Une ligne par établissement ; ligne absente = valeurs par défaut du front.';
