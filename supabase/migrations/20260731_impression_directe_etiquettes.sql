-- ════════════════════════════════════════════════════════════════════════════
-- Impression directe des étiquettes DLC : file d'attente + agent local
-- ────────────────────────────────────────────────────────────────────────────
-- Un iPad ne peut pas parler à une imprimante réseau : pas de socket TCP en
-- JavaScript, IPP bloqué par le contenu mixte et CORS, Bluetooth classique hors
-- de portée de Web Bluetooth. Le seul chemin est un agent qui tourne sur le
-- réseau du restaurant.
--
-- Sens de circulation : l'app DÉPOSE un lot, l'agent VIENT le chercher. Tout est
-- sortant depuis le restaurant, donc aucun port à ouvrir, aucun certificat à
-- gérer, l'imprimante n'est jamais exposée.
--
--   iPad ──> print_jobs (Supabase) <── agent ──(IPP)──> Brother QL-820NWB
--
-- Migration idempotente. RLS via les helpers existants user_can_access_etab(text)
-- et current_user_role() (le cast auth.uid()::text y est déjà encapsulé).
-- Rollback en fin de fichier.
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. print_agents - un agent déclaré par poste d'impression
-- ─────────────────────────────────────────────────────────────────────────────
-- Le secret n'est JAMAIS stocké en clair : l'agent présente son jeton, la
-- fonction edge en compare le sha256. Un dump de la table ne permet pas de se
-- faire passer pour un agent.
create table if not exists public.print_agents (
  id               uuid        primary key default gen_random_uuid(),
  etablissement_id text        not null references public.etablissements(id) on delete cascade,
  nom              text        not null,
  token_sha256     text        not null unique,
  imprimante_label text,
  derniere_vue     timestamptz,
  actif            boolean     not null default true,
  created_at       timestamptz not null default now()
);

comment on table public.print_agents is
  'Agent d''impression installé sur le réseau d''un établissement. Récupère les lots d''étiquettes et les envoie à l''imprimante en IPP.';
comment on column public.print_agents.token_sha256 is
  'sha256 du jeton de l''agent. Le jeton en clair n''existe que dans la configuration de l''agent.';
comment on column public.print_agents.derniere_vue is
  'Dernier appel de l''agent. Le front s''en sert pour savoir si l''impression directe est disponible.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. print_jobs - un lot d'étiquettes à imprimer
-- ─────────────────────────────────────────────────────────────────────────────
-- Le PDF voyage en base64 dans la ligne : un lot réaliste (quelques dizaines
-- d'étiquettes) pèse quelques centaines de Ko, et cela évite une politique de
-- stockage supplémentaire. La contrainte de taille protège la file d'un lot
-- aberrant qui bloquerait l'agent.
create table if not exists public.print_jobs (
  id               uuid        primary key default gen_random_uuid(),
  etablissement_id text        not null references public.etablissements(id) on delete cascade,
  statut           text        not null default 'en_attente',
  nb_etiquettes    integer     not null,
  mode             text,
  pdf_base64       text        not null,
  cree_par         text        references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  pris_at          timestamptz,
  termine_at       timestamptz,
  erreur           text
);

comment on table public.print_jobs is
  'File d''attente des lots d''étiquettes DLC. Déposés par l''app, consommés par l''agent d''impression.';
comment on column public.print_jobs.statut is
  'en_attente -> en_cours -> imprime | erreur. L''agent passe en_cours pour ne pas imprimer deux fois le même lot.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.print_jobs'::regclass and conname = 'print_jobs_statut_valide'
  ) then
    alter table public.print_jobs
      add constraint print_jobs_statut_valide
      check (statut in ('en_attente', 'en_cours', 'imprime', 'erreur'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.print_jobs'::regclass and conname = 'print_jobs_nb_etiquettes_positif'
  ) then
    alter table public.print_jobs
      add constraint print_jobs_nb_etiquettes_positif
      check (nb_etiquettes > 0);
  end if;

  -- ~6 Mo de base64, soit largement de quoi couvrir un rouleau entier.
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.print_jobs'::regclass and conname = 'print_jobs_pdf_taille'
  ) then
    alter table public.print_jobs
      add constraint print_jobs_pdf_taille
      check (length(pdf_base64) between 1 and 8000000);
  end if;
end $$;

-- L'agent interroge « le prochain lot en attente de mon établissement » toutes
-- les deux secondes : c'est la seule lecture chaude de cette table.
create index if not exists idx_print_jobs_file
  on public.print_jobs (etablissement_id, statut, created_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RLS
-- ─────────────────────────────────────────────────────────────────────────────
-- L'agent ne passe PAS par ces politiques : il s'authentifie par jeton auprès de
-- la fonction edge « print-agent », qui travaille en service_role. Côté client,
-- on n'ouvre donc que ce dont l'app a besoin : déposer un lot et suivre le sien.
alter table public.print_agents enable row level security;
alter table public.print_jobs   enable row level security;

-- print_agents : lecture seule côté app (savoir si l'impression directe est
-- disponible). La création d'un agent se fait en SQL à l'installation.
drop policy if exists print_agents_select on public.print_agents;
create policy print_agents_select on public.print_agents
  for select to authenticated
  using (user_can_access_etab(etablissement_id));

-- print_jobs : les rôles qui étiquettent peuvent déposer et suivre leurs lots.
drop policy if exists print_jobs_select on public.print_jobs;
create policy print_jobs_select on public.print_jobs
  for select to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and current_user_role() = any(array['consultant','patron','resp_cuisine','cuisinier'])
  );

drop policy if exists print_jobs_insert on public.print_jobs;
create policy print_jobs_insert on public.print_jobs
  for insert to authenticated
  with check (
    user_can_access_etab(etablissement_id)
    and current_user_role() = any(array['consultant','patron','resp_cuisine','cuisinier'])
  );

-- Aucune politique UPDATE ni DELETE : l'avancement d'un lot appartient à
-- l'agent, et l'historique d'impression ne se réécrit pas depuis l'app.

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Prise d'un lot - atomique
-- ─────────────────────────────────────────────────────────────────────────────
-- « for update skip locked » et non un select suivi d'un update : au redémarrage
-- de l'agent, ou si un second agent est déclaré par erreur, deux relèves
-- simultanées prendraient le même lot et la brigade se retrouverait avec deux
-- jeux d'étiquettes DLC identiques. Sur un registre d'autocontrôle, c'est une
-- erreur qu'on ne rattrape pas au tri.
create or replace function public.claim_print_job(p_etablissement_id text)
returns public.print_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  lot public.print_jobs;
begin
  update public.print_jobs
     set statut = 'en_cours', pris_at = now()
   where id = (
     select id from public.print_jobs
      where etablissement_id = p_etablissement_id
        and statut = 'en_attente'
      order by created_at
      limit 1
      for update skip locked
   )
  returning * into lot;
  return lot;
end $$;

revoke all on function public.claim_print_job(text) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Purge - la file n'est pas un journal
-- ─────────────────────────────────────────────────────────────────────────────
-- Les lots portent un PDF : les garder indéfiniment ferait grossir la base pour
-- rien. Appelée par l'agent à chaque relève, sans droits particuliers puisque
-- la fonction est en security definer et ne touche qu'aux lots terminés.
create or replace function public.purge_print_jobs(retention_jours integer default 7)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  supprimes integer;
begin
  delete from public.print_jobs
  where statut in ('imprime', 'erreur')
    and termine_at < now() - make_interval(days => greatest(1, retention_jours));
  get diagnostics supprimes = row_count;
  return supprimes;
end $$;

revoke all on function public.purge_print_jobs(integer) from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (à jouer manuellement si besoin)
-- ────────────────────────────────────────────────────────────────────────────
-- drop function if exists public.purge_print_jobs(integer);
-- drop function if exists public.claim_print_job(text);
-- drop table if exists public.print_jobs;
-- drop table if exists public.print_agents;
-- ════════════════════════════════════════════════════════════════════════════
