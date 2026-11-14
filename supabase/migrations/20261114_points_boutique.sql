-- ════════════════════════════════════════════════════════════════════════════
-- Points des employés et boutique de cadeaux (lot P1, 14.11.2026)
--
-- Chaque employé gagne des points quand il fait dans l'app les gestes qui
-- comptent pour la maison (relevés et contrôles HACCP, photos de traçabilité,
-- factures d'achat, pertes, comptage et validation d'inventaire) et les
-- dépense dans une boutique tenue par l'établissement.
--
--   * points_reglages   : un par établissement. Aucune ligne = système éteint.
--   * points_mouvements : le registre. Solde = somme des points. Écrit
--                         seulement par les déclencheurs et les RPC de ce
--                         fichier (aucune policy d'écriture).
--   * points_cadeaux    : le catalogue de la boutique, tenu par qui gère.
--   * points_commandes  : les commandes, remboursées si refusées ou annulées.
--
-- Robustesse (D8) : chaque fonction de déclencheur est SECURITY DEFINER,
-- AFTER ... FOR EACH ROW, et rattrape toute erreur par un warning, sur le
-- modèle de journal_activite_log : une erreur des points ne fait JAMAIS
-- échouer l'écriture métier. Le premier test est l'état des réglages : un
-- établissement qui n'a jamais allumé le système ne paie qu'une lecture par
-- clé primaire.
--
-- Tables neuves et déclencheurs AFTER seulement : aucune colonne ajoutée ni
-- modifiée sur une table existante. Rejouable : create ... if not exists,
-- create or replace, drop ... if exists avant create.
-- Inverse : supabase/migrations-inverse/20261114_points_boutique.sql
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Défauts, définis à un seul endroit (miroir JS : src/modules/points/bareme.js)

-- Barème par défaut (D4). Une clé absente des réglages prend cette valeur.
create or replace function public.points_bareme_defaut()
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $fn$
  select '{
    "releve_haccp":      {"points": 2,  "plafond": 10},
    "controle_haccp":    {"points": 3,  "plafond": 5},
    "photo_tracabilite": {"points": 3,  "plafond": 10},
    "facture_achat":     {"points": 5,  "plafond": 10},
    "perte_declaree":    {"points": 2,  "plafond": 5},
    "comptage_zone":     {"points": 10, "plafond": 5},
    "inventaire_valide": {"points": 20, "plafond": 2}
  }'::jsonb
$fn$;

-- Rôles participants par défaut (D2) : tous sauf consultant et patron, qui ne
-- peuvent jamais y entrer.
create or replace function public.points_roles_defaut()
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $fn$
  select array['resp_cuisine', 'cuisinier', 'serveur', 'hote', 'praticien_spa',
               'receptionniste', 'gouvernante', 'femme_de_chambre', 'technicien']::text[]
$fn$;

-- Libellés fixes des actions (français ; glossaires EN et ES côté front).
create or replace function public.points_libelle_action(p_action text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $fn$
  select case p_action
    when 'releve_haccp'      then 'Relevé HACCP'
    when 'controle_haccp'    then 'Contrôle HACCP'
    when 'photo_tracabilite' then 'Photo de traçabilité'
    when 'facture_achat'     then 'Facture d''achat'
    when 'perte_declaree'    then 'Perte déclarée'
    when 'comptage_zone'     then 'Zone d''inventaire comptée'
    when 'inventaire_valide' then 'Inventaire validé'
    else p_action
  end
$fn$;

-- ─── Tables ──────────────────────────────────────────────────────────────────

create table if not exists public.points_reglages (
  etablissement_id   text primary key references public.etablissements(id) on delete cascade,
  actif              boolean not null default false,
  roles_participants text[] not null default public.points_roles_defaut(),
  exclus             text[] not null default '{}'::text[],
  bareme             jsonb not null default '{}'::jsonb,
  updated_at         timestamptz not null default now(),
  updated_by         text
);

create table if not exists public.points_mouvements (
  id               uuid primary key default gen_random_uuid(),
  etablissement_id text not null references public.etablissements(id) on delete cascade,
  user_id          text not null references public.profiles(id) on delete cascade,
  points           integer not null check (points <> 0),
  action           text,
  source_table     text,
  source_id        text,
  sens             text not null check (sens in ('credit', 'annulation', 'commande', 'remboursement', 'ajustement')),
  libelle          text,
  created_at       timestamptz not null default now(),
  created_by       text
);

create table if not exists public.points_cadeaux (
  id               uuid primary key default gen_random_uuid(),
  etablissement_id text not null references public.etablissements(id) on delete cascade,
  nom              text not null check (length(btrim(nom)) between 1 and 120),
  description      text check (description is null or length(description) <= 1000),
  cout             integer not null check (cout > 0 and cout <= 100000),
  stock            integer check (stock is null or stock >= 0),
  actif            boolean not null default true,
  ordre            integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.points_commandes (
  id               uuid primary key default gen_random_uuid(),
  etablissement_id text not null references public.etablissements(id) on delete cascade,
  user_id          text not null references public.profiles(id) on delete cascade,
  -- no action (vérifié en fin d'instruction) : un cadeau commandé se retire
  -- de la boutique (actif = false), il ne se supprime pas ; la suppression
  -- d'un établissement emporte cadeaux et commandes par cascade.
  cadeau_id        uuid not null references public.points_cadeaux(id),
  cout             integer not null check (cout > 0),
  statut           text not null default 'demandee' check (statut in ('demandee', 'remise', 'refusee', 'annulee')),
  note             text check (note is null or length(note) <= 500),
  created_at       timestamptz not null default now(),
  traitee_par      text,
  traitee_le       timestamptz
);

-- ─── Index ───────────────────────────────────────────────────────────────────

-- Solde, historique et plafond du jour (etablissement_id, user_id, created_at).
create index if not exists idx_points_mouvements_etab_user_date
  on public.points_mouvements (etablissement_id, user_id, created_at);
-- Clé étrangère user_id (suppression d'un profil, abonnement Realtime filtré).
create index if not exists idx_points_mouvements_user
  on public.points_mouvements (user_id);
-- Idempotence (D6) et annulation unique (D7) : un mouvement par (table source,
-- id source, personne, sens). Les ajustements n'ont pas de source.
create unique index if not exists uq_points_mouvements_source
  on public.points_mouvements (source_table, source_id, user_id, sens)
  where source_table is not null;

create index if not exists idx_points_cadeaux_etab
  on public.points_cadeaux (etablissement_id, ordre);

create index if not exists idx_points_commandes_etab_statut
  on public.points_commandes (etablissement_id, statut, created_at desc);
create index if not exists idx_points_commandes_user
  on public.points_commandes (user_id);
create index if not exists idx_points_commandes_cadeau
  on public.points_commandes (cadeau_id);

-- ─── Lecture du barème ───────────────────────────────────────────────────────

-- Points et plafond d'une action. Barème absent ou clé absente : défaut de D4.
-- Clé présente mais illisible : erreur, que le déclencheur rattrape (D8).
create or replace function public.points_regle(p_bareme jsonb, p_action text,
  out points integer, out plafond integer)
language plpgsql
immutable
set search_path = public, pg_temp
as $fn$
declare
  d jsonb := public.points_bareme_defaut() -> p_action;
  v jsonb;
begin
  if d is null then
    raise exception 'points : action inconnue %', p_action;
  end if;
  points  := (d ->> 'points')::integer;
  plafond := (d ->> 'plafond')::integer;
  if p_bareme is null or p_bareme = '{}'::jsonb then
    return;
  end if;
  if jsonb_typeof(p_bareme) <> 'object' then
    raise exception 'points : barème illisible';
  end if;
  v := p_bareme -> p_action;
  if v is null then
    return;
  end if;
  if jsonb_typeof(v) <> 'object'
     or jsonb_typeof(v -> 'points') <> 'number'
     or jsonb_typeof(v -> 'plafond') <> 'number'
     or (v ->> 'points')::numeric <> trunc((v ->> 'points')::numeric)
     or (v ->> 'plafond')::numeric <> trunc((v ->> 'plafond')::numeric)
     or (v ->> 'points')::numeric not between 0 and 100
     or (v ->> 'plafond')::numeric not between 0 and 50 then
    raise exception 'points : barème illisible pour %', p_action;
  end if;
  points  := (v ->> 'points')::integer;
  plafond := (v ->> 'plafond')::integer;
end;
$fn$;

-- Barème complet tel qu'il s'applique, pour l'affichage : une clé illisible
-- s'affiche à sa valeur par défaut au lieu de faire échouer l'écran.
create or replace function public.points_bareme_effectif(p_bareme jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $fn$
declare
  k text;
  r record;
  res jsonb := '{}'::jsonb;
begin
  for k in select jsonb_object_keys(public.points_bareme_defaut()) loop
    begin
      select * into r from public.points_regle(p_bareme, k);
    exception when others then
      select * into r from public.points_regle(null, k);
    end;
    res := res || jsonb_build_object(k, jsonb_build_object('points', r.points, 'plafond', r.plafond));
  end loop;
  return res;
end;
$fn$;

-- ─── Qui gagne ───────────────────────────────────────────────────────────────

-- Participation (D2) : profil actif rattaché à l'établissement, rôle parmi les
-- participants, jamais consultant ni patron, pas exclu.
create or replace function public.points_participe(p_user text, p_etab text, p_reg public.points_reglages)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user
      and p.actif is not false
      and p_etab = any (coalesce(p.etablissement_ids, '{}'::text[]))
      and coalesce(p.role, '') not in ('', 'consultant', 'patron')
      and p.role = any (coalesce(p_reg.roles_participants, '{}'::text[]))
      and not (p_user = any (coalesce(p_reg.exclus, '{}'::text[])))
  )
$fn$;

-- Attribution (D5) : la colonne d'auteur si c'est un profil rattaché à
-- l'établissement de la ligne, sinon la personne connectée si elle l'est,
-- sinon personne.
create or replace function public.points_auteur(p_candidat text, p_etab text)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid text := (select auth.uid())::text;
begin
  if p_candidat is not null and exists (
    select 1 from public.profiles p
    where p.id = p_candidat and p_etab = any (coalesce(p.etablissement_ids, '{}'::text[]))
  ) then
    return p_candidat;
  end if;
  if v_uid is not null and exists (
    select 1 from public.profiles p
    where p.id = v_uid and p_etab = any (coalesce(p.etablissement_ids, '{}'::text[]))
  ) then
    return v_uid;
  end if;
  return null;
end;
$fn$;

-- ─── Crédit et annulation (appelés par les déclencheurs seulement) ───────────

create or replace function public.points_crediter(p_etab text, p_candidat text, p_action text,
  p_table text, p_source_id text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  r public.points_reglages;
  v_user text;
  v_pts integer;
  v_plafond integer;
  v_n integer;
  v_debut timestamptz;
begin
  select * into r from public.points_reglages where etablissement_id = p_etab and actif;
  if not found then
    return;
  end if;
  select g.points, g.plafond into v_pts, v_plafond from public.points_regle(r.bareme, p_action) g;
  if coalesce(v_pts, 0) <= 0 or coalesce(v_plafond, 0) <= 0 then
    return;
  end if;
  v_user := public.points_auteur(p_candidat, p_etab);
  if v_user is null or not public.points_participe(v_user, p_etab, r) then
    return;
  end if;
  -- Plafond par jour et par personne, jour de Zurich. Les crédits annulés
  -- comptent : créer puis supprimer ne rouvre pas le plafond.
  v_debut := date_trunc('day', now() at time zone 'Europe/Zurich') at time zone 'Europe/Zurich';
  select count(*) into v_n
  from public.points_mouvements m
  where m.etablissement_id = p_etab
    and m.user_id = v_user
    and m.created_at >= v_debut
    and m.action = p_action
    and m.sens = 'credit';
  if v_n >= v_plafond then
    return;
  end if;
  insert into public.points_mouvements
    (etablissement_id, user_id, points, action, source_table, source_id, sens, libelle, created_by)
  values
    (p_etab, v_user, v_pts, p_action, p_table, p_source_id, 'credit',
     public.points_libelle_action(p_action), (select auth.uid())::text)
  on conflict (source_table, source_id, user_id, sens) where source_table is not null do nothing;
end;
$fn$;

-- Annulation (D7) : un mouvement négatif du même montant, une seule fois.
create or replace function public.points_annuler(p_table text, p_source_id text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  insert into public.points_mouvements
    (etablissement_id, user_id, points, action, source_table, source_id, sens, libelle, created_by)
  select m.etablissement_id, m.user_id, -m.points, m.action, m.source_table, m.source_id, 'annulation',
         'Annulation : ' || coalesce(m.libelle, ''), (select auth.uid())::text
  from public.points_mouvements m
  where m.source_table = p_table
    and m.source_id = p_source_id
    and m.sens = 'credit'
  on conflict (source_table, source_id, user_id, sens) where source_table is not null do nothing;
end;
$fn$;

-- ─── Fonctions de déclencheur (D8) ───────────────────────────────────────────
-- Insertion : premier test = réglages actifs. Suppression : premier test = une
-- ligne de réglages existe (un établissement qui n'a jamais allumé le système
-- n'a aucun crédit à annuler) ; une fois allumé puis éteint, une suppression
-- annule encore le crédit, par une lecture d'index.

create or replace function public.points_trg_haccp_releves()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.points_reglages r where r.etablissement_id = new.etablissement_id and r.actif) then
      return null;
    end if;
    perform public.points_crediter(new.etablissement_id, new.operateur, 'releve_haccp', 'haccp_releves', new.id);
  elsif tg_op = 'DELETE' then
    if not exists (select 1 from public.points_reglages r where r.etablissement_id = old.etablissement_id) then
      return null;
    end if;
    perform public.points_annuler('haccp_releves', old.id);
  end if;
  return null;
exception when others then
  raise warning 'points_trg_haccp_releves : %', sqlerrm;
  return null;
end;
$fn$;

create or replace function public.points_trg_haccp_controls()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.points_reglages r where r.etablissement_id = new.etablissement_id and r.actif) then
      return null;
    end if;
    perform public.points_crediter(new.etablissement_id, new.operateur, 'controle_haccp', 'haccp_controls', new.id);
  elsif tg_op = 'DELETE' then
    if not exists (select 1 from public.points_reglages r where r.etablissement_id = old.etablissement_id) then
      return null;
    end if;
    perform public.points_annuler('haccp_controls', old.id);
  end if;
  return null;
exception when others then
  raise warning 'points_trg_haccp_controls : %', sqlerrm;
  return null;
end;
$fn$;

create or replace function public.points_trg_haccp_tracabilite()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.points_reglages r where r.etablissement_id = new.etablissement_id and r.actif) then
      return null;
    end if;
    if coalesce(btrim(new.photo_url), '') = '' and coalesce(btrim(new.storage_path), '') = '' then
      return null;
    end if;
    perform public.points_crediter(new.etablissement_id, new.operateur, 'photo_tracabilite', 'haccp_tracabilite', new.id);
  elsif tg_op = 'DELETE' then
    if not exists (select 1 from public.points_reglages r where r.etablissement_id = old.etablissement_id) then
      return null;
    end if;
    perform public.points_annuler('haccp_tracabilite', old.id);
  end if;
  return null;
exception when others then
  raise warning 'points_trg_haccp_tracabilite : %', sqlerrm;
  return null;
end;
$fn$;

create or replace function public.points_trg_achats_documents()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.points_reglages r where r.etablissement_id = new.etablissement_id and r.actif) then
      return null;
    end if;
    if new.source is null or new.source not in ('scan', 'pdf') then
      return null;
    end if;
    perform public.points_crediter(new.etablissement_id, new.created_by, 'facture_achat', 'achats_documents', new.id);
  elsif tg_op = 'DELETE' then
    if not exists (select 1 from public.points_reglages r where r.etablissement_id = old.etablissement_id) then
      return null;
    end if;
    perform public.points_annuler('achats_documents', old.id);
  end if;
  return null;
exception when others then
  raise warning 'points_trg_achats_documents : %', sqlerrm;
  return null;
end;
$fn$;

create or replace function public.points_trg_scans_facture()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.points_reglages r where r.etablissement_id = new.etablissement_id and r.actif) then
      return null;
    end if;
    perform public.points_crediter(new.etablissement_id, new.created_by, 'facture_achat', 'scans_facture', new.id);
  elsif tg_op = 'DELETE' then
    if not exists (select 1 from public.points_reglages r where r.etablissement_id = old.etablissement_id) then
      return null;
    end if;
    perform public.points_annuler('scans_facture', old.id);
  end if;
  return null;
exception when others then
  raise warning 'points_trg_scans_facture : %', sqlerrm;
  return null;
end;
$fn$;

create or replace function public.points_trg_pertes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.points_reglages r where r.etablissement_id = new.etablissement_id and r.actif) then
      return null;
    end if;
    -- Points fixes : jamais liés à la quantité ni à la valeur perdue.
    perform public.points_crediter(new.etablissement_id, new.declare_par, 'perte_declaree', 'pertes', new.id);
  elsif tg_op = 'DELETE' then
    if not exists (select 1 from public.points_reglages r where r.etablissement_id = old.etablissement_id) then
      return null;
    end if;
    perform public.points_annuler('pertes', old.id);
  end if;
  return null;
exception when others then
  raise warning 'points_trg_pertes : %', sqlerrm;
  return null;
end;
$fn$;

-- Comptage : première ligne du journal des saisies pour un triplet
-- (inventaire, zone, personne). L'établissement est celui de l'inventaire,
-- jamais la seule colonne de la saisie. Une ligne plus ancienne du même
-- triplet (comptage commencé avant l'allumage) empêche le crédit : rien n'est
-- crédité pour le passé. Le journal n'est jamais purgé : pas d'annulation ici.
create or replace function public.points_trg_saisies_inventaire()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_etab text;
  v_zone text := coalesce(new.zone, '');
begin
  if new.etablissement_id is not null
     and not exists (select 1 from public.points_reglages r where r.etablissement_id = new.etablissement_id and r.actif) then
    return null;
  end if;
  select i.etablissement_id into v_etab from public.inventaires i where i.id = new.inventaire_id;
  if v_etab is null or (new.etablissement_id is not null and v_etab <> new.etablissement_id) then
    return null;
  end if;
  if not exists (select 1 from public.points_reglages r where r.etablissement_id = v_etab and r.actif) then
    return null;
  end if;
  -- Strictement plus ancienne : les lignes d'une même instruction ou d'une
  -- même transaction partagent created_at et se voient entre elles dans un
  -- déclencheur AFTER ; l'index unique du registre n'en crédite qu'une.
  if exists (
    select 1 from public.inventaire_saisies_offline s
    where s.user_id = new.user_id
      and s.inventaire_id = new.inventaire_id
      and coalesce(s.zone, '') = v_zone
      and s.created_at < new.created_at
  ) then
    return null;
  end if;
  perform public.points_crediter(v_etab, new.user_id, 'comptage_zone', 'inventaire_saisies_offline',
    new.inventaire_id || ':' || v_zone);
  return null;
exception when others then
  raise warning 'points_trg_saisies_inventaire : %', sqlerrm;
  return null;
end;
$fn$;

-- Validation d'un inventaire, créditée au valideur. Les déclencheurs ne
-- s'appellent que si le statut passe à « validé » (clause WHEN plus bas) :
-- chaque comptage met à jour l'inventaire, il ne doit rien coûter.
create or replace function public.points_trg_inventaires()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    if not exists (select 1 from public.points_reglages r where r.etablissement_id = new.etablissement_id and r.actif) then
      return null;
    end if;
    if new.statut is distinct from 'validé' then
      return null;
    end if;
    perform public.points_crediter(new.etablissement_id, new.valide_par, 'inventaire_valide', 'inventaires', new.id);
  elsif tg_op = 'DELETE' then
    if not exists (select 1 from public.points_reglages r where r.etablissement_id = old.etablissement_id) then
      return null;
    end if;
    perform public.points_annuler('inventaires', old.id);
  end if;
  return null;
exception when others then
  raise warning 'points_trg_inventaires : %', sqlerrm;
  return null;
end;
$fn$;

-- updated_at du catalogue.
create or replace function public.points_cadeaux_touch()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  new.updated_at := now();
  return new;
end;
$fn$;

-- ─── Déclencheurs ────────────────────────────────────────────────────────────

drop trigger if exists trg_points_haccp_releves on public.haccp_releves;
create trigger trg_points_haccp_releves
  after insert or delete on public.haccp_releves
  for each row execute function public.points_trg_haccp_releves();

drop trigger if exists trg_points_haccp_controls on public.haccp_controls;
create trigger trg_points_haccp_controls
  after insert or delete on public.haccp_controls
  for each row execute function public.points_trg_haccp_controls();

drop trigger if exists trg_points_haccp_tracabilite on public.haccp_tracabilite;
create trigger trg_points_haccp_tracabilite
  after insert or delete on public.haccp_tracabilite
  for each row execute function public.points_trg_haccp_tracabilite();

drop trigger if exists trg_points_achats_documents on public.achats_documents;
create trigger trg_points_achats_documents
  after insert or delete on public.achats_documents
  for each row execute function public.points_trg_achats_documents();

drop trigger if exists trg_points_scans_facture on public.scans_facture;
create trigger trg_points_scans_facture
  after insert or delete on public.scans_facture
  for each row execute function public.points_trg_scans_facture();

drop trigger if exists trg_points_pertes on public.pertes;
create trigger trg_points_pertes
  after insert or delete on public.pertes
  for each row execute function public.points_trg_pertes();

drop trigger if exists trg_points_saisies_inventaire on public.inventaire_saisies_offline;
create trigger trg_points_saisies_inventaire
  after insert on public.inventaire_saisies_offline
  for each row execute function public.points_trg_saisies_inventaire();

drop trigger if exists trg_points_inventaires_ins on public.inventaires;
create trigger trg_points_inventaires_ins
  after insert on public.inventaires
  for each row when (new.statut = 'validé')
  execute function public.points_trg_inventaires();

drop trigger if exists trg_points_inventaires_maj on public.inventaires;
create trigger trg_points_inventaires_maj
  after update of statut on public.inventaires
  for each row when (new.statut = 'validé' and old.statut is distinct from new.statut)
  execute function public.points_trg_inventaires();

drop trigger if exists trg_points_inventaires_sup on public.inventaires;
create trigger trg_points_inventaires_sup
  after delete on public.inventaires
  for each row execute function public.points_trg_inventaires();

drop trigger if exists trg_points_cadeaux_touch on public.points_cadeaux;
create trigger trg_points_cadeaux_touch
  before update on public.points_cadeaux
  for each row execute function public.points_cadeaux_touch();

-- ─── RPC ─────────────────────────────────────────────────────────────────────

-- Vrai si la personne connectée gère les points de cet établissement.
create or replace function public.points_gere(p_etab text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select (select auth.uid()) is not null
     and public.user_can_access_etab(p_etab)
     and coalesce(public.user_peut_gerer('points', array['consultant', 'patron']), false)
$fn$;

-- État pour l'écran et le menu : actif, participant, gère, barème appliqué ;
-- rôles et exclusions pour qui gère seulement.
create or replace function public.points_etat(p_etab text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid text := (select auth.uid())::text;
  r public.points_reglages;
  v_gere boolean;
  v_part boolean := false;
begin
  if v_uid is null or not public.user_can_access_etab(p_etab) then
    return jsonb_build_object('actif', false, 'participant', false, 'gere', false);
  end if;
  v_gere := public.points_gere(p_etab);
  select * into r from public.points_reglages where etablissement_id = p_etab;
  if found and r.actif then
    v_part := public.points_participe(v_uid, p_etab, r);
  end if;
  return jsonb_build_object(
    'actif', coalesce(r.actif, false),
    'participant', v_part,
    'gere', v_gere,
    'bareme', public.points_bareme_effectif(r.bareme),
    'roles_participants', case when v_gere then to_jsonb(coalesce(r.roles_participants, public.points_roles_defaut())) end,
    'exclus', case when v_gere then to_jsonb(coalesce(r.exclus, '{}'::text[])) end
  );
end;
$fn$;

-- Solde de la personne connectée (RLS : ses propres lignes).
create or replace function public.points_solde(p_etab text)
returns integer
language sql
stable
set search_path = public, pg_temp
as $fn$
  select coalesce(sum(m.points), 0)::integer
  from public.points_mouvements m
  where m.etablissement_id = p_etab
    and m.user_id = (select auth.uid())::text
$fn$;

-- Soldes de l'équipe, pour qui gère.
create or replace function public.points_soldes(p_etab text)
returns table (user_id text, prenom text, nom text, role text, actif boolean,
               participant boolean, exclu boolean, solde integer, gagne_mois integer)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  r public.points_reglages;
  v_mois timestamptz := date_trunc('month', now() at time zone 'Europe/Zurich') at time zone 'Europe/Zurich';
begin
  if not public.points_gere(p_etab) then
    raise exception 'Accès réservé à qui gère les points' using errcode = '42501';
  end if;
  select * into r from public.points_reglages where etablissement_id = p_etab;
  return query
  select p.id, p.prenom, p.nom, p.role, (p.actif is not false),
         coalesce(public.points_participe(p.id, p_etab, r), false),
         p.id = any (coalesce(r.exclus, '{}'::text[])),
         coalesce((select sum(m.points) from public.points_mouvements m
                   where m.etablissement_id = p_etab and m.user_id = p.id), 0)::integer,
         coalesce((select sum(m.points) from public.points_mouvements m
                   where m.etablissement_id = p_etab and m.user_id = p.id
                     and m.sens in ('credit', 'annulation') and m.created_at >= v_mois), 0)::integer
  from public.profiles p
  where (p_etab = any (coalesce(p.etablissement_ids, '{}'::text[]))
         and coalesce(p.role, '') not in ('', 'consultant', 'patron'))
     or exists (select 1 from public.points_mouvements m where m.etablissement_id = p_etab and m.user_id = p.id)
  order by p.prenom nulls last, p.nom nulls last;
end;
$fn$;

-- Réglages (D13). Un argument nul garde la valeur en place.
create or replace function public.points_regler(p_etab text, p_actif boolean default null,
  p_roles text[] default null, p_exclus text[] default null, p_bareme jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid text := (select auth.uid())::text;
  r public.points_reglages;
  k text;
  v jsonb;
begin
  if not public.points_gere(p_etab) then
    raise exception 'Accès réservé à qui gère les points' using errcode = '42501';
  end if;
  if p_roles is not null then
    if p_roles && array['consultant', 'patron']::text[] then
      raise exception 'La direction ne participe jamais aux points' using errcode = '22023';
    end if;
    if exists (select 1 from unnest(p_roles) x where x is null or not (x = any (public.points_roles_defaut()))) then
      raise exception 'Rôle inconnu dans les participants' using errcode = '22023';
    end if;
  end if;
  if p_exclus is not null and cardinality(p_exclus) > 500 then
    raise exception 'Trop de personnes exclues' using errcode = '22023';
  end if;
  if p_bareme is not null then
    if jsonb_typeof(p_bareme) <> 'object' then
      raise exception 'Barème illisible' using errcode = '22023';
    end if;
    for k, v in select * from jsonb_each(p_bareme) loop
      if not (public.points_bareme_defaut() ? k) then
        raise exception 'Action inconnue dans le barème : %', k using errcode = '22023';
      end if;
      if jsonb_typeof(v) <> 'object'
         or jsonb_typeof(v -> 'points') <> 'number'
         or jsonb_typeof(v -> 'plafond') <> 'number'
         or (v ->> 'points')::numeric <> trunc((v ->> 'points')::numeric)
         or (v ->> 'plafond')::numeric <> trunc((v ->> 'plafond')::numeric)
         or (v ->> 'points')::numeric not between 0 and 100
         or (v ->> 'plafond')::numeric not between 0 and 50 then
        raise exception 'Barème : points de 0 à 100 et plafond de 0 à 50, en nombres entiers (%)', k
          using errcode = '22023';
      end if;
    end loop;
  end if;
  select * into r from public.points_reglages where etablissement_id = p_etab;
  insert into public.points_reglages as t
    (etablissement_id, actif, roles_participants, exclus, bareme, updated_at, updated_by)
  values (
    p_etab,
    coalesce(p_actif, r.actif, false),
    coalesce(p_roles, r.roles_participants, public.points_roles_defaut()),
    coalesce((select array_agg(distinct x) from unnest(p_exclus) x where x is not null and x <> ''),
             case when p_exclus is not null then '{}'::text[] end, r.exclus, '{}'::text[]),
    coalesce(p_bareme, r.bareme, '{}'::jsonb),
    now(),
    v_uid
  )
  on conflict (etablissement_id) do update set
    actif = excluded.actif,
    roles_participants = excluded.roles_participants,
    exclus = excluded.exclus,
    bareme = excluded.bareme,
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by;
  return public.points_etat(p_etab);
end;
$fn$;

-- Commande (D11), sous verrou par (personne, établissement).
create or replace function public.points_commander(p_cadeau_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid text := (select auth.uid())::text;
  v_etab text;
  c public.points_cadeaux;
  r public.points_reglages;
  v_solde integer;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  select etablissement_id into v_etab from public.points_cadeaux where id = p_cadeau_id;
  if v_etab is null or not public.user_can_access_etab(v_etab) then
    raise exception 'Cadeau introuvable' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtext('points:' || v_uid || ':' || v_etab));
  select * into c from public.points_cadeaux where id = p_cadeau_id for update;
  if not found then
    raise exception 'Cadeau introuvable' using errcode = 'P0002';
  end if;
  select * into r from public.points_reglages where etablissement_id = v_etab;
  if not found or not r.actif then
    raise exception 'La boutique est fermée' using errcode = 'P0001';
  end if;
  if not public.points_participe(v_uid, v_etab, r) then
    raise exception 'Vous ne participez pas aux points de cet établissement' using errcode = '42501';
  end if;
  if not c.actif then
    raise exception 'Ce cadeau n''est plus proposé' using errcode = 'P0001';
  end if;
  if c.stock is not null and c.stock < 1 then
    raise exception 'Ce cadeau n''est plus en stock' using errcode = 'P0001';
  end if;
  select coalesce(sum(m.points), 0) into v_solde
  from public.points_mouvements m
  where m.etablissement_id = v_etab and m.user_id = v_uid;
  if v_solde < c.cout then
    raise exception 'Solde insuffisant' using errcode = 'P0001';
  end if;
  insert into public.points_commandes (etablissement_id, user_id, cadeau_id, cout)
  values (v_etab, v_uid, c.id, c.cout)
  returning id into v_id;
  insert into public.points_mouvements
    (etablissement_id, user_id, points, source_table, source_id, sens, libelle, created_by)
  values (v_etab, v_uid, -c.cout, 'points_commandes', v_id::text, 'commande', 'Commande : ' || c.nom, v_uid);
  if c.stock is not null then
    update public.points_cadeaux set stock = stock - 1 where id = c.id;
  end if;
  return v_id;
end;
$fn$;

-- Remboursement d'une commande : stock rendu, points rendus une seule fois.
create or replace function public.points_rembourser(p_commande public.points_commandes)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_nom text;
begin
  select nom into v_nom from public.points_cadeaux where id = p_commande.cadeau_id;
  insert into public.points_mouvements
    (etablissement_id, user_id, points, source_table, source_id, sens, libelle, created_by)
  values (p_commande.etablissement_id, p_commande.user_id, p_commande.cout, 'points_commandes',
          p_commande.id::text, 'remboursement', 'Remboursement : ' || coalesce(v_nom, ''),
          (select auth.uid())::text)
  on conflict (source_table, source_id, user_id, sens) where source_table is not null do nothing;
  update public.points_cadeaux set stock = stock + 1 where id = p_commande.cadeau_id and stock is not null;
end;
$fn$;

-- La personne annule sa commande encore « demandée ».
create or replace function public.points_annuler_commande(p_commande_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid text := (select auth.uid())::text;
  k public.points_commandes;
begin
  select * into k from public.points_commandes where id = p_commande_id for update;
  if not found or v_uid is null or k.user_id <> v_uid or not public.user_can_access_etab(k.etablissement_id) then
    raise exception 'Commande introuvable' using errcode = 'P0002';
  end if;
  if k.statut <> 'demandee' then
    raise exception 'Cette commande est déjà traitée' using errcode = 'P0001';
  end if;
  update public.points_commandes
     set statut = 'annulee', traitee_par = v_uid, traitee_le = now()
   where id = k.id;
  perform public.points_rembourser(k);
end;
$fn$;

-- Qui gère remet (définitif) ou refuse (remboursé, stock rendu).
create or replace function public.points_traiter_commande(p_commande_id uuid, p_statut text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid text := (select auth.uid())::text;
  k public.points_commandes;
begin
  if p_statut is null or p_statut not in ('remise', 'refusee') then
    raise exception 'Statut inconnu' using errcode = '22023';
  end if;
  select * into k from public.points_commandes where id = p_commande_id for update;
  if not found or not public.points_gere(k.etablissement_id) then
    raise exception 'Commande introuvable' using errcode = 'P0002';
  end if;
  if k.user_id = v_uid then
    raise exception 'Une commande ne se traite jamais pour soi-même' using errcode = '42501';
  end if;
  if k.statut <> 'demandee' then
    raise exception 'Cette commande est déjà traitée' using errcode = 'P0001';
  end if;
  update public.points_commandes
     set statut = p_statut,
         note = nullif(left(btrim(coalesce(p_note, '')), 500), ''),
         traitee_par = v_uid,
         traitee_le = now()
   where id = k.id;
  if p_statut = 'refusee' then
    perform public.points_rembourser(k);
  end if;
end;
$fn$;

-- Ajustement manuel (D12) : qui gère, motif obligatoire, 500 points au plus
-- par geste, jamais pour soi-même, jamais pour la direction, solde jamais
-- négatif. Rend le nouveau solde.
create or replace function public.points_ajuster(p_user text, p_etab text, p_points integer, p_motif text)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid text := (select auth.uid())::text;
  v_motif text := btrim(coalesce(p_motif, ''));
  v_solde integer;
begin
  if not public.points_gere(p_etab) then
    raise exception 'Accès réservé à qui gère les points' using errcode = '42501';
  end if;
  if p_user is null or p_user = v_uid then
    raise exception 'Un ajustement ne se fait jamais pour soi-même' using errcode = '42501';
  end if;
  if v_motif = '' then
    raise exception 'Le motif est obligatoire' using errcode = '22023';
  end if;
  if p_points is null or p_points = 0 or abs(p_points) > 500 then
    raise exception 'Un ajustement va de 1 à 500 points' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = p_user
      and p_etab = any (coalesce(p.etablissement_ids, '{}'::text[]))
      and coalesce(p.role, '') not in ('', 'consultant', 'patron')
  ) then
    raise exception 'Personne introuvable dans cet établissement' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtext('points:' || p_user || ':' || p_etab));
  select coalesce(sum(m.points), 0) into v_solde
  from public.points_mouvements m
  where m.etablissement_id = p_etab and m.user_id = p_user;
  if v_solde + p_points < 0 then
    raise exception 'Le solde ne peut pas devenir négatif' using errcode = 'P0001';
  end if;
  insert into public.points_mouvements (etablissement_id, user_id, points, sens, libelle, created_by)
  values (p_etab, p_user, p_points, 'ajustement', left(v_motif, 200), v_uid);
  return v_solde + p_points;
end;
$fn$;

-- ─── RLS ─────────────────────────────────────────────────────────────────────

alter table public.points_reglages   enable row level security;
alter table public.points_mouvements enable row level security;
alter table public.points_cadeaux    enable row level security;
alter table public.points_commandes  enable row level security;

-- Réglages : lus par qui gère ; écrits par points_regler seulement.
drop policy if exists points_reglages_select on public.points_reglages;
create policy points_reglages_select on public.points_reglages
  for select to authenticated
  using (
    public.user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('points', array['consultant', 'patron']))
  );

-- Registre : ses propres lignes ; toutes celles de l'établissement pour qui
-- gère. Aucune policy d'écriture : seuls les déclencheurs et les RPC écrivent.
drop policy if exists points_mouvements_select on public.points_mouvements;
create policy points_mouvements_select on public.points_mouvements
  for select to authenticated
  using (
    public.user_can_access_etab(etablissement_id)
    and (
      user_id = (select auth.uid())::text
      or (select public.user_peut_gerer('points', array['consultant', 'patron']))
    )
  );

-- Catalogue : lu par les membres de l'établissement, écrit par qui gère.
drop policy if exists points_cadeaux_select on public.points_cadeaux;
create policy points_cadeaux_select on public.points_cadeaux
  for select to authenticated
  using (public.user_can_access_etab(etablissement_id));

drop policy if exists points_cadeaux_insert on public.points_cadeaux;
create policy points_cadeaux_insert on public.points_cadeaux
  for insert to authenticated
  with check (
    public.user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('points', array['consultant', 'patron']))
  );

drop policy if exists points_cadeaux_update on public.points_cadeaux;
create policy points_cadeaux_update on public.points_cadeaux
  for update to authenticated
  using (
    public.user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('points', array['consultant', 'patron']))
  )
  with check (
    public.user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('points', array['consultant', 'patron']))
  );

drop policy if exists points_cadeaux_delete on public.points_cadeaux;
create policy points_cadeaux_delete on public.points_cadeaux
  for delete to authenticated
  using (
    public.user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('points', array['consultant', 'patron']))
  );

-- Commandes : les siennes ; toutes celles de l'établissement pour qui gère.
-- Écrites par les RPC seulement.
drop policy if exists points_commandes_select on public.points_commandes;
create policy points_commandes_select on public.points_commandes
  for select to authenticated
  using (
    public.user_can_access_etab(etablissement_id)
    and (
      user_id = (select auth.uid())::text
      or (select public.user_peut_gerer('points', array['consultant', 'patron']))
    )
  );

-- ─── Droits ──────────────────────────────────────────────────────────────────
-- Les droits par défaut du schéma public donnent tout à anon et authenticated :
-- on retire ce que les policies ne doivent jamais avoir à refuser.

revoke all on public.points_reglages, public.points_mouvements, public.points_cadeaux, public.points_commandes
  from anon, authenticated;
grant select on public.points_reglages, public.points_mouvements, public.points_commandes to authenticated;
grant select, insert, update, delete on public.points_cadeaux to authenticated;

-- Fonctions internes : jamais appelables par un client (points_crediter
-- créditerait n'importe qui).
revoke execute on function public.points_regle(jsonb, text) from public, anon, authenticated;
revoke execute on function public.points_bareme_effectif(jsonb) from public, anon, authenticated;
revoke execute on function public.points_participe(text, text, public.points_reglages) from public, anon, authenticated;
revoke execute on function public.points_auteur(text, text) from public, anon, authenticated;
revoke execute on function public.points_crediter(text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.points_annuler(text, text) from public, anon, authenticated;
revoke execute on function public.points_rembourser(public.points_commandes) from public, anon, authenticated;
revoke execute on function public.points_trg_haccp_releves() from public, anon, authenticated;
revoke execute on function public.points_trg_haccp_controls() from public, anon, authenticated;
revoke execute on function public.points_trg_haccp_tracabilite() from public, anon, authenticated;
revoke execute on function public.points_trg_achats_documents() from public, anon, authenticated;
revoke execute on function public.points_trg_scans_facture() from public, anon, authenticated;
revoke execute on function public.points_trg_pertes() from public, anon, authenticated;
revoke execute on function public.points_trg_saisies_inventaire() from public, anon, authenticated;
revoke execute on function public.points_trg_inventaires() from public, anon, authenticated;
revoke execute on function public.points_cadeaux_touch() from public, anon, authenticated;

-- RPC de l'écran : personnes connectées seulement.
revoke execute on function public.points_bareme_defaut() from public, anon;
revoke execute on function public.points_roles_defaut() from public, anon;
revoke execute on function public.points_libelle_action(text) from public, anon;
revoke execute on function public.points_gere(text) from public, anon;
revoke execute on function public.points_etat(text) from public, anon;
revoke execute on function public.points_solde(text) from public, anon;
revoke execute on function public.points_soldes(text) from public, anon;
revoke execute on function public.points_regler(text, boolean, text[], text[], jsonb) from public, anon;
revoke execute on function public.points_commander(uuid) from public, anon;
revoke execute on function public.points_annuler_commande(uuid) from public, anon;
revoke execute on function public.points_traiter_commande(uuid, text, text) from public, anon;
revoke execute on function public.points_ajuster(text, text, integer, text) from public, anon;
grant execute on function public.points_bareme_defaut() to authenticated;
grant execute on function public.points_roles_defaut() to authenticated;
grant execute on function public.points_libelle_action(text) to authenticated;
grant execute on function public.points_gere(text) to authenticated;
grant execute on function public.points_etat(text) to authenticated;
grant execute on function public.points_solde(text) to authenticated;
grant execute on function public.points_soldes(text) to authenticated;
grant execute on function public.points_regler(text, boolean, text[], text[], jsonb) to authenticated;
grant execute on function public.points_commander(uuid) to authenticated;
grant execute on function public.points_annuler_commande(uuid) to authenticated;
grant execute on function public.points_traiter_commande(uuid, text, text) to authenticated;
grant execute on function public.points_ajuster(text, text, integer, text) to authenticated;

-- ─── Realtime (D16) : retour immédiat « +N points » ──────────────────────────

do $pub$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'points_mouvements'
  ) then
    alter publication supabase_realtime add table public.points_mouvements;
  end if;
end $pub$;

comment on table public.points_reglages is
  'Points des employés : réglages par établissement. Aucune ligne = système éteint. Écrit par points_regler.';
comment on table public.points_mouvements is
  'Points des employés : registre (solde = somme). Écrit par les déclencheurs points_trg_* et les RPC points_*, jamais par un client.';
comment on table public.points_cadeaux is
  'Boutique des points : catalogue de cadeaux par établissement, tenu par qui gère points.';
comment on table public.points_commandes is
  'Boutique des points : commandes. Écrites par points_commander, points_annuler_commande, points_traiter_commande.';
