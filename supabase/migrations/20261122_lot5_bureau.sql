-- -----------------------------------------------------------------------------
-- Lot 5 du plan 15 « Les modules de bureau et les routines » (22.11.2026)
--
-- Ajout seul (expand), à jouer APRÈS 20261122_lot2a_reglages_modules.sql et
-- 20261122_lot6b_reglages_hotel.sql (la contrainte de reglages_modules lit la
-- fonction de vérification de chacun). Trois parties indépendantes :
--
--   A. reglages_modules reçoit deux modules : 'journal' (vue d'office,
--      format de l'export) et 'statistiques' (vue d'office de la maison).
--      Le journal ne se lit que par le consultant et le patron : un
--      déclencheur refuse ses réglages aux autres rôles (les policies du lot
--      2a laissent aussi écrire le responsable cuisine). Les statistiques
--      suivent les policies du lot 2a (direction de la maison).
--
--   B. compta_reglages reçoit l'exercice de la maison (mois de début, 1 =
--      janvier par défaut) et les cartes de l'accueil (null = les quatre).
--      Policies inchangées (droit « Régler les factures »).
--
--   C. documents : un dossier peut être réservé à des rôles
--      (roles_visibles : null = toute l'équipe ; tableau vide = la direction
--      seule ; sinon ces rôles en plus de la direction). Ce qu'il contient,
--      sous-dossiers compris, suit la même règle. Le consultant et le patron
--      voient tout et eux seuls règlent la visibilité (déclencheur). Les
--      policies de documents et celles du stockage 'documents' (lecture,
--      remplacement, suppression) appliquent la règle : un fichier caché ne
--      se signe ni ne se télécharge.
--      Avant : les quatre policies de documents et du stockage ne testaient
--      que l'établissement (lues en production le 22.11.2026, non versionnées
--      jusqu'ici). La migration s'arrête si une policy d'un autre nom existe.
--
-- Le front déployé ne lit aucune colonne neuve et aucun dossier n'est réservé
-- tant que la direction ne le décide pas : rien ne change pour lui.
--
-- Idempotente. Aucun remplissage de données. Retour arrière :
-- 20261122_lot5_bureau.rollback.sql.
-- -----------------------------------------------------------------------------

-- Les contraintes et les policies se reposent sous des verrous brefs : ne pas
-- attendre plus de 3 s derrière une transaction longue.
set local lock_timeout = '3s';

-- ── Garde : aucune policy d'un nom inattendu sur ce que la migration resserre
do $$
declare
  v_inconnues text;
begin
  select string_agg(policyname, ', ') into v_inconnues
  from pg_policies
  where schemaname = 'public' and tablename = 'documents'
    and policyname not in ('documents_select', 'documents_insert', 'documents_update', 'documents_delete');
  if v_inconnues is not null then
    raise exception 'Policies inattendues sur documents : %', v_inconnues;
  end if;

  select string_agg(policyname, ', ') into v_inconnues
  from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and (coalesce(qual, '') like '%''documents''%' or coalesce(with_check, '') like '%''documents''%')
    and policyname not in ('documents_storage_select', 'documents_storage_insert', 'documents_storage_update', 'documents_storage_delete');
  if v_inconnues is not null then
    raise exception 'Policies inattendues sur le stockage documents : %', v_inconnues;
  end if;
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- A. reglages_modules : journal et statistiques
-- ═════════════════════════════════════════════════════════════════════════════

create or replace function public.reglages_modules_bureau_valide(p_module text, p_config jsonb)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog, public
as $fn$
declare
  v_cle text;
begin
  if p_config is null or jsonb_typeof(p_config) <> 'object' then return false; end if;

  if p_module = 'journal' then
    for v_cle in select key from jsonb_each(p_config) loop
      if v_cle not in ('vue', 'export') then return false; end if;
    end loop;
    if p_config ? 'vue'
       and (jsonb_typeof(p_config -> 'vue') <> 'string' or (p_config ->> 'vue') not in ('regroupee', 'detail')) then
      return false;
    end if;
    if p_config ? 'export'
       and (jsonb_typeof(p_config -> 'export') <> 'string' or (p_config ->> 'export') not in ('csv', 'xlsx')) then
      return false;
    end if;
    return true;

  elsif p_module = 'statistiques' then
    for v_cle in select key from jsonb_each(p_config) loop
      if v_cle <> 'vue_defaut' then return false; end if;
    end loop;
    if p_config ? 'vue_defaut' and jsonb_typeof(p_config -> 'vue_defaut') <> 'null'
       and (jsonb_typeof(p_config -> 'vue_defaut') <> 'string' or (p_config ->> 'vue_defaut') !~ '^[a-z][a-z0-9_]{0,39}$') then
      return false;
    end if;
    return true;
  end if;

  return false;
end;
$fn$;

revoke all on function public.reglages_modules_bureau_valide(text, jsonb) from public, anon, authenticated;
grant execute on function public.reglages_modules_bureau_valide(text, jsonb) to authenticated, service_role;

comment on function public.reglages_modules_bureau_valide(text, jsonb) is
  'Forme des blocs de reglages_modules pour les modules journal et statistiques (lot 5). Faux pour tout autre module.';

-- Les deux contraintes se reposent à l'identique de celles du lot 6b, élargies
-- aux deux modules du bureau. Une ligne existante reste valide.
alter table public.reglages_modules drop constraint if exists reglages_modules_module_check;
alter table public.reglages_modules add constraint reglages_modules_module_check
  check (module in ('pertes', 'groupes', 'mep', 'fiches_salle', 'kds', 'catalogue', 'etages', 'demandes', 'repas', 'journal', 'statistiques'));

alter table public.reglages_modules drop constraint if exists reglages_modules_config_check;
alter table public.reglages_modules add constraint reglages_modules_config_check
  check (public.reglages_modules_config_valide(module, config)
    or public.reglages_modules_hotel_valide(module, config)
    or public.reglages_modules_bureau_valide(module, config));

-- Le journal se lit par le consultant et le patron (RLS de journal_activite) :
-- eux seuls règlent sa vue et son export. Hors session (éditeur SQL,
-- service), rien n'est bloqué : auth.uid() est nul.
create or replace function public.reglages_modules_journal_garde()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $fn$
begin
  if (select auth.uid()) is null then
    return coalesce(new, old);
  end if;
  if ((tg_op <> 'INSERT' and old.module = 'journal') or (tg_op <> 'DELETE' and new.module = 'journal'))
     and coalesce((select public.current_user_role()), '') not in ('consultant', 'patron') then
    raise exception 'Ce réglage est réservé au consultant et au patron.' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$fn$;

revoke all on function public.reglages_modules_journal_garde() from public, anon, authenticated;

create or replace trigger trg_reglages_modules_journal_garde
  before insert or update or delete on public.reglages_modules
  for each row execute function public.reglages_modules_journal_garde();

-- ═════════════════════════════════════════════════════════════════════════════
-- B. compta_reglages : exercice et cartes de l'accueil
-- ═════════════════════════════════════════════════════════════════════════════

alter table public.compta_reglages
  add column if not exists exercice_debut_mois smallint not null default 1,
  add column if not exists cartes_accueil text[];

alter table public.compta_reglages drop constraint if exists compta_reglages_exercice_check;
alter table public.compta_reglages add constraint compta_reglages_exercice_check
  check (exercice_debut_mois between 1 and 12);

alter table public.compta_reglages drop constraint if exists compta_reglages_cartes_check;
alter table public.compta_reglages add constraint compta_reglages_cartes_check
  check (cartes_accueil is null
    or (cardinality(cartes_accueil) between 1 and 4
        and cartes_accueil <@ array['ca', 'matiere', 'personnel', 'resultat']::text[]));

comment on column public.compta_reglages.exercice_debut_mois is
  'Mois où commence l''exercice de la maison (1 = janvier). La période « Année » de la Comptabilité le suit (lot 5).';
comment on column public.compta_reglages.cartes_accueil is
  'Cartes de l''accueil de la Comptabilité, parmi ca, matiere, personnel, resultat. Null = les quatre (lot 5).';

-- ═════════════════════════════════════════════════════════════════════════════
-- C. documents : dossiers réservés à des rôles
-- ═════════════════════════════════════════════════════════════════════════════

alter table public.documents add column if not exists roles_visibles text[];

alter table public.documents drop constraint if exists documents_roles_visibles_check;
alter table public.documents add constraint documents_roles_visibles_check
  check (roles_visibles is null
    or (type = 'folder'
        and cardinality(roles_visibles) <= 20
        and array_to_string(roles_visibles, ',') ~ '^([a-z_]+(,[a-z_]+)*)?$'));

comment on column public.documents.roles_visibles is
  'Dossier réservé (lot 5) : null = toute l''équipe ; {} = la direction seule ; sinon ces rôles en plus du consultant et du patron. Le contenu suit la règle.';

-- La remontée des dossiers parents (policies ci-dessous) et la lecture d'un
-- objet du stockage par son chemin.
create index if not exists documents_parent_id_idx on public.documents (parent_id);
create index if not exists documents_storage_path_idx on public.documents (storage_path) where storage_path is not null;

-- Un document est-il visible pour la personne connectée ? Le document et
-- chaque dossier au-dessus doivent laisser passer son rôle. SECURITY DEFINER :
-- la remontée lit la table sans repasser par ses policies (pas de boucle).
-- Une chaîne cassée (parent disparu) s'arrête là ; 30 niveaux au plus.
create or replace function public.document_visible(p_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_role   text := coalesce(public.current_user_role(), '');
  v_cur    text := p_id;
  v_roles  text[];
  v_parent text;
  v_n      int := 0;
begin
  if v_role in ('consultant', 'patron') then return true; end if;
  while v_cur is not null and v_n < 30 loop
    select d.roles_visibles, d.parent_id into v_roles, v_parent
    from public.documents d where d.id = v_cur;
    if not found then return true; end if;
    if v_roles is not null and not (v_role = any (v_roles)) then return false; end if;
    v_cur := v_parent;
    v_n := v_n + 1;
  end loop;
  return true;
end;
$fn$;

revoke all on function public.document_visible(text) from public, anon, authenticated;
grant execute on function public.document_visible(text) to authenticated, service_role;

-- Un objet du stockage 'documents' est-il visible ? Caché seulement si une
-- ligne de documents le porte et que cette ligne est cachée : un fichier en
-- cours d'envoi (pas encore de ligne) reste lisible par son auteur, comme
-- avant.
create or replace function public.document_objet_visible(p_chemin text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $fn$
  select not exists (
    select 1 from public.documents d
    where d.storage_path = p_chemin and not public.document_visible(d.id)
  );
$fn$;

revoke all on function public.document_objet_visible(text) from public, anon, authenticated;
grant execute on function public.document_objet_visible(text) to authenticated, service_role;

-- Qui règle la visibilité : le consultant et le patron. Hors session, rien
-- n'est bloqué (auth.uid() nul).
create or replace function public.documents_garde_visibilite()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $fn$
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  if ((tg_op = 'INSERT' and new.roles_visibles is not null)
      or (tg_op = 'UPDATE' and new.roles_visibles is distinct from old.roles_visibles))
     and coalesce((select public.current_user_role()), '') not in ('consultant', 'patron') then
    raise exception 'Seuls le consultant et le patron choisissent qui voit un dossier.' using errcode = '42501';
  end if;
  return new;
end;
$fn$;

revoke all on function public.documents_garde_visibilite() from public, anon, authenticated;

drop trigger if exists trg_documents_garde_visibilite on public.documents;
create trigger trg_documents_garde_visibilite
  before insert or update of roles_visibles on public.documents
  for each row execute function public.documents_garde_visibilite();

-- Policies de documents : l'établissement, comme avant, plus la visibilité.
-- Un document neuf se range dans un dossier visible.
drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents
  for select to authenticated
  using (user_can_access_etab(etablissement_id) and public.document_visible(id));

drop policy if exists documents_insert on public.documents;
create policy documents_insert on public.documents
  for insert to authenticated
  with check (user_can_access_etab(etablissement_id)
    and (parent_id is null or public.document_visible(parent_id)));

drop policy if exists documents_update on public.documents;
create policy documents_update on public.documents
  for update to authenticated
  using (user_can_access_etab(etablissement_id) and public.document_visible(id))
  with check (user_can_access_etab(etablissement_id)
    and (parent_id is null or public.document_visible(parent_id)));

drop policy if exists documents_delete on public.documents;
create policy documents_delete on public.documents
  for delete to authenticated
  using (user_can_access_etab(etablissement_id) and public.document_visible(id));

-- Stockage 'documents' : lecture (et donc lien signé), remplacement et
-- suppression d'un fichier caché refusés. L'envoi ne change pas.
drop policy if exists documents_storage_select on storage.objects;
create policy documents_storage_select on storage.objects
  for select to authenticated
  using (bucket_id = 'documents'
    and user_can_access_etab(split_part(name, '/', 1))
    and public.document_objet_visible(name));

drop policy if exists documents_storage_update on storage.objects;
create policy documents_storage_update on storage.objects
  for update to authenticated
  using (bucket_id = 'documents'
    and user_can_access_etab(split_part(name, '/', 1))
    and public.document_objet_visible(name));

drop policy if exists documents_storage_delete on storage.objects;
create policy documents_storage_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents'
    and user_can_access_etab(split_part(name, '/', 1))
    and public.document_objet_visible(name));
