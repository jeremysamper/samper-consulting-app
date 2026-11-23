-- -----------------------------------------------------------------------------
-- Lot 2a « chaque réglage à sa place » : la base (22.11.2026)
--
-- Ajout seul (expand). Le front déployé ne lit rien de neuf ; une ligne ou une
-- colonne absente vaut les valeurs par défaut du front. Seule retouche d'une
-- règle existante : les policies d'écriture des trois tables de configuration
-- HACCP (décision D1), compatibles avec le front en ligne, où seul le
-- consultant ouvre l'onglet de configuration.
--
--   1. HACCP (D1)
--      haccp_creneaux.jours      jours de la semaine du créneau (1 = lundi,
--                                7 = dimanche) ; null = tous les jours
--      haccp_zones, haccp_creneaux, haccp_ctrl_templates : écriture par la
--      direction de la maison (consultant, patron, resp_cuisine). Suppression
--      d'un frigo ou d'un contrôle : consultant seul, parce qu'elle efface
--      l'historique (relevés en cascade, contrôles privés de leur nom). La
--      direction les met hors service (actif = false). Un créneau se supprime
--      sans toucher aux relevés : direction. Relevés et contrôles inchangés.
--
--   2. reglages_modules          une ligne par établissement et par module :
--                                pertes, groupes, mep, fiches_salle, kds,
--                                catalogue. Lue par toute l'équipe de
--                                l'établissement (ces réglages pilotent ce
--                                qu'elle voit), écrite par la direction de la
--                                maison. Forme de chaque bloc vérifiée en base
--                                (reglages_modules_config_valide) ; une clé
--                                inconnue est acceptée pour la suite.
--
--   3. mep_modeles               modèles de liste de mise en place, par poste.
--                                Lus par qui lit la mise en place, écrits par
--                                la direction.
--
--   4. sops                      rôles désignés et rappel de chaque procédure.
--                                RLS de la table inchangée (toute l'équipe) ;
--                                ces colonnes-là, direction seule (déclencheur).
--
--   5. fournisseurs              délai de paiement propre. RLS de la table
--                                inchangée (toute l'équipe) ; cette colonne,
--                                direction seule (déclencheur).
--
--   6. (retiré le 23.11.2026)    les jours de livraison, l'heure limite, le
--                                délai de commande des fournisseurs et la
--                                table commande_cibles de la Commande V1 (D3) :
--                                après la démo, Jérémy garde le module
--                                Commande de la production.
--
--   7. compta_reglages           délai de paiement par défaut et catégories de
--                                charges de la maison. RLS inchangée
--                                (direction et droit factures_achat).
--
-- Seuil d'alerte des pertes : il existe déjà, règle d'alerte « pertes_elevees »
-- (alert_rules.config.threshold_chf), lue par alerts-evaluator. Rien de neuf.
-- Menus types des groupes : table groupe_menus, déjà là.
--
-- Idempotente : chaque objet est créé « si absent » ou remplacé à l'identique.
-- Aucun remplissage de données. Retour arrière :
-- 20261122_lot2a_reglages_modules.rollback.sql.
-- -----------------------------------------------------------------------------

-- Les alter table prennent un verrou exclusif sur des tables lues en service :
-- ne pas attendre plus de 3 s derrière une transaction longue (la migration
-- échoue alors, sans rien changer, et se rejoue plus tard).
set local lock_timeout = '3s';


-- =============================================================================
-- 1. HACCP (D1)
-- =============================================================================

alter table public.haccp_creneaux
  add column if not exists jours smallint[]
    constraint haccp_creneaux_jours_check
    check (jours is null or (cardinality(jours) between 1 and 7 and jours <@ array[1,2,3,4,5,6,7]::smallint[]));

comment on column public.haccp_creneaux.jours is
  'Jours de la semaine du créneau, 1 = lundi à 7 = dimanche. Null = tous les jours.';

-- Les policies d'écriture de ces trois tables ne sont versionnées que pour
-- haccp_creneaux (20260810_haccp_creneaux.sql). Relues dans pg_policies le
-- 22.11.2026 : hz_*, hcr_* et ht_*, toutes « user_can_access_etab » seul. Une
-- policy d'écriture d'un autre nom s'ajouterait en OU aux nouvelles et
-- annulerait D1 : la migration s'arrête plutôt que de la laisser.
do $$
declare
  v_inconnues text;
begin
  select string_agg(tablename || '.' || policyname, ', ') into v_inconnues
  from pg_policies
  where schemaname = 'public'
    and tablename in ('haccp_zones', 'haccp_creneaux', 'haccp_ctrl_templates')
    and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
    and policyname not in ('hz_insert', 'hz_update', 'hz_delete',
                           'hcr_insert', 'hcr_update', 'hcr_delete',
                           'ht_insert', 'ht_update', 'ht_delete');
  if v_inconnues is not null then
    raise exception 'Policies d''écriture inattendues sur les tables HACCP : %', v_inconnues;
  end if;
end $$;

-- Frigos et appareils
drop policy if exists hz_insert on public.haccp_zones;
create policy hz_insert on public.haccp_zones
  for insert to authenticated
  with check (user_can_access_etab(etablissement_id)
    and (select public.current_user_role()) in ('consultant', 'patron', 'resp_cuisine'));

drop policy if exists hz_update on public.haccp_zones;
create policy hz_update on public.haccp_zones
  for update to authenticated
  using (user_can_access_etab(etablissement_id)
    and (select public.current_user_role()) in ('consultant', 'patron', 'resp_cuisine'))
  with check (user_can_access_etab(etablissement_id)
    and (select public.current_user_role()) in ('consultant', 'patron', 'resp_cuisine'));

-- Supprimer un frigo supprime ses relevés (haccp_releves_zone_id_fkey, on
-- delete cascade) : c'est supprimer de l'historique, réservé au consultant.
drop policy if exists hz_delete on public.haccp_zones;
create policy hz_delete on public.haccp_zones
  for delete to authenticated
  using (user_can_access_etab(etablissement_id)
    and (select public.current_user_role()) = 'consultant');

-- Créneaux de relevé
drop policy if exists hcr_insert on public.haccp_creneaux;
create policy hcr_insert on public.haccp_creneaux
  for insert to authenticated
  with check (user_can_access_etab(etablissement_id)
    and (select public.current_user_role()) in ('consultant', 'patron', 'resp_cuisine'));

drop policy if exists hcr_update on public.haccp_creneaux;
create policy hcr_update on public.haccp_creneaux
  for update to authenticated
  using (user_can_access_etab(etablissement_id)
    and (select public.current_user_role()) in ('consultant', 'patron', 'resp_cuisine'))
  with check (user_can_access_etab(etablissement_id)
    and (select public.current_user_role()) in ('consultant', 'patron', 'resp_cuisine'));

-- Un créneau n'a aucun lien avec les relevés : sa suppression ne retire rien
-- de l'historique.
drop policy if exists hcr_delete on public.haccp_creneaux;
create policy hcr_delete on public.haccp_creneaux
  for delete to authenticated
  using (user_can_access_etab(etablissement_id)
    and (select public.current_user_role()) in ('consultant', 'patron', 'resp_cuisine'));

-- Contrôles d'hygiène (modèles)
drop policy if exists ht_insert on public.haccp_ctrl_templates;
create policy ht_insert on public.haccp_ctrl_templates
  for insert to authenticated
  with check (user_can_access_etab(etablissement_id)
    and (select public.current_user_role()) in ('consultant', 'patron', 'resp_cuisine'));

drop policy if exists ht_update on public.haccp_ctrl_templates;
create policy ht_update on public.haccp_ctrl_templates
  for update to authenticated
  using (user_can_access_etab(etablissement_id)
    and (select public.current_user_role()) in ('consultant', 'patron', 'resp_cuisine'))
  with check (user_can_access_etab(etablissement_id)
    and (select public.current_user_role()) in ('consultant', 'patron', 'resp_cuisine'));

-- Supprimer un modèle laisse ses contrôles passés sans nom
-- (haccp_controls_template_id_fkey, on delete set null) : consultant seul.
drop policy if exists ht_delete on public.haccp_ctrl_templates;
create policy ht_delete on public.haccp_ctrl_templates
  for delete to authenticated
  using (user_can_access_etab(etablissement_id)
    and (select public.current_user_role()) = 'consultant');


-- =============================================================================
-- 2. reglages_modules
-- =============================================================================

-- Liste de textes : tableau de chaînes non vides, sans espace au bord,
-- distinctes (casse ignorée),
-- au plus p_max_items, chacune d'au plus p_max_len caractères, et conforme à
-- p_motif s'il est donné. Clé absente ou null JSON : rien à vérifier.
create or replace function public.reglages_textes_valides(
  p jsonb, p_max_items integer, p_max_len integer, p_motif text default null
)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $fn$
declare
  v_e    jsonb;
  v_t    text;
  v_vus  text[] := '{}';
begin
  if p is null or jsonb_typeof(p) = 'null' then return true; end if;
  if jsonb_typeof(p) <> 'array' then return false; end if;
  if jsonb_array_length(p) > p_max_items then return false; end if;
  for v_e in select value from jsonb_array_elements(p) loop
    if jsonb_typeof(v_e) <> 'string' then return false; end if;
    v_t := v_e #>> '{}';
    if v_t <> btrim(v_t) then return false; end if;
    if v_t = '' or char_length(v_t) > p_max_len then return false; end if;
    if p_motif is not null and v_t !~ p_motif then return false; end if;
    if lower(v_t) = any (v_vus) then return false; end if;
    v_vus := v_vus || lower(v_t);
  end loop;
  return true;
end;
$fn$;

-- Entier JSON entre p_min et p_max. Clé absente ou null JSON : rien à vérifier.
create or replace function public.reglages_entier_valide(p jsonb, p_min integer, p_max integer)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $fn$
declare
  v_n numeric;
begin
  if p is null or jsonb_typeof(p) = 'null' then return true; end if;
  if jsonb_typeof(p) <> 'number' then return false; end if;
  v_n := (p #>> '{}')::numeric;
  return v_n = trunc(v_n) and v_n between p_min and p_max;
end;
$fn$;

-- Booléen JSON. Clé absente ou null JSON : rien à vérifier.
create or replace function public.reglages_booleen_valide(p jsonb)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $fn$
  select p is null or jsonb_typeof(p) in ('null', 'boolean');
$fn$;

-- Forme des réglages d'un module. Clés connues, par module :
--   pertes        motifs        liste de textes (30 au plus, 60 caractères)
--                 valideurs     rôles qui valident une perte
--   groupes       delai_alerte_jours   entier 1 à 60 (14 par défaut au front)
--                 statuts       objet : a_lire, lu, pret ->
--                               { libelle : texte de 40 caractères au plus,
--                                 actif : booléen }
--                 types_actifs  types de groupe proposés (mariage,
--                               anniversaire, seminaire, groupe,
--                               apero_dinatoire)
--   mep           postes        liste de textes (30 au plus, 40 caractères)
--   fiches_salle  valideurs     rôles qui valident une fiche
--                 brouillons_visibles_salle   booléen
--                 champs        objet : temps, accords, allergenes -> booléen
--   kds           son           booléen
--                 attention_minutes   entier 1 à 119
--                 retard_minutes      entier 2 à 120, plus grand que
--                                     attention_minutes
--   catalogue     categories    liste de textes (40 au plus, 60 caractères)
--                 unites        tableau (40 au plus) de
--                               { code : texte de 20 caractères au plus,
--                                 base : 'g' | 'ml' | 'pcs',
--                                 facteur : nombre > 0, quantité de la base
--                                           dans une unité }
-- Une clé inconnue est acceptée : un lot suivant peut en ajouter sans
-- migration. Un module inconnu est refusé.
create or replace function public.reglages_modules_config_valide(p_module text, p_config jsonb)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog, public
as $fn$
declare
  v_bloc   jsonb;
  v_cle    text;
  v_val    jsonb;
  v_codes  text[] := '{}';
  v_code   text;
  v_n      numeric;
begin
  if p_config is null or jsonb_typeof(p_config) <> 'object' then return false; end if;

  if p_module = 'pertes' then
    return public.reglages_textes_valides(p_config -> 'motifs', 30, 60)
       and public.reglages_textes_valides(p_config -> 'valideurs', 20, 40, '^[a-z_]+$');

  elsif p_module = 'groupes' then
    if not public.reglages_entier_valide(p_config -> 'delai_alerte_jours', 1, 60) then return false; end if;
    if not public.reglages_textes_valides(p_config -> 'types_actifs', 5, 40,
      '^(mariage|anniversaire|seminaire|groupe|apero_dinatoire)$') then return false; end if;
    v_bloc := p_config -> 'statuts';
    if v_bloc is not null and jsonb_typeof(v_bloc) <> 'null' then
      if jsonb_typeof(v_bloc) <> 'object' then return false; end if;
      for v_cle, v_val in select key, value from jsonb_each(v_bloc) loop
        if v_cle not in ('a_lire', 'lu', 'pret') then return false; end if;
        if jsonb_typeof(v_val) <> 'object' then return false; end if;
        if v_val ? 'libelle' then
          if jsonb_typeof(v_val -> 'libelle') <> 'string' then return false; end if;
          if btrim(v_val ->> 'libelle') = '' or char_length(v_val ->> 'libelle') > 40 then return false; end if;
        end if;
        if v_val ? 'actif' and jsonb_typeof(v_val -> 'actif') <> 'boolean' then return false; end if;
      end loop;
    end if;
    return true;

  elsif p_module = 'mep' then
    return public.reglages_textes_valides(p_config -> 'postes', 30, 40);

  elsif p_module = 'fiches_salle' then
    if not public.reglages_textes_valides(p_config -> 'valideurs', 20, 40, '^[a-z_]+$') then return false; end if;
    if not public.reglages_booleen_valide(p_config -> 'brouillons_visibles_salle') then return false; end if;
    v_bloc := p_config -> 'champs';
    if v_bloc is not null and jsonb_typeof(v_bloc) <> 'null' then
      if jsonb_typeof(v_bloc) <> 'object' then return false; end if;
      for v_cle, v_val in select key, value from jsonb_each(v_bloc) loop
        if v_cle not in ('temps', 'accords', 'allergenes') then return false; end if;
        if jsonb_typeof(v_val) <> 'boolean' then return false; end if;
      end loop;
    end if;
    return true;

  elsif p_module = 'kds' then
    if not public.reglages_booleen_valide(p_config -> 'son') then return false; end if;
    if not public.reglages_entier_valide(p_config -> 'attention_minutes', 1, 119) then return false; end if;
    if not public.reglages_entier_valide(p_config -> 'retard_minutes', 2, 120) then return false; end if;
    if jsonb_typeof(p_config -> 'attention_minutes') = 'number'
       and jsonb_typeof(p_config -> 'retard_minutes') = 'number' then
      if (p_config ->> 'attention_minutes')::numeric >= (p_config ->> 'retard_minutes')::numeric then
        return false;
      end if;
    end if;
    return true;

  elsif p_module = 'catalogue' then
    if not public.reglages_textes_valides(p_config -> 'categories', 40, 60) then return false; end if;
    v_bloc := p_config -> 'unites';
    if v_bloc is not null and jsonb_typeof(v_bloc) <> 'null' then
      if jsonb_typeof(v_bloc) <> 'array' then return false; end if;
      if jsonb_array_length(v_bloc) > 40 then return false; end if;
      for v_val in select value from jsonb_array_elements(v_bloc) loop
        if jsonb_typeof(v_val) <> 'object' then return false; end if;
        if jsonb_typeof(v_val -> 'code') is distinct from 'string' then return false; end if;
        if (v_val ->> 'code') <> btrim(v_val ->> 'code') then return false; end if;
        v_code := lower(v_val ->> 'code');
        if v_code = '' or char_length(v_code) > 20 then return false; end if;
        if v_code = any (v_codes) then return false; end if;
        v_codes := v_codes || v_code;
        if coalesce(v_val ->> 'base', '') not in ('g', 'ml', 'pcs') then return false; end if;
        if jsonb_typeof(v_val -> 'facteur') is distinct from 'number' then return false; end if;
        v_n := (v_val ->> 'facteur')::numeric;
        if v_n <= 0 or v_n > 100000 then return false; end if;
      end loop;
    end if;
    return true;

  end if;

  return false;
end;
$fn$;

revoke all on function public.reglages_textes_valides(jsonb, integer, integer, text) from public, anon, authenticated;
revoke all on function public.reglages_entier_valide(jsonb, integer, integer) from public, anon, authenticated;
revoke all on function public.reglages_booleen_valide(jsonb) from public, anon, authenticated;
revoke all on function public.reglages_modules_config_valide(text, jsonb) from public, anon, authenticated;
grant execute on function public.reglages_textes_valides(jsonb, integer, integer, text) to authenticated, service_role;
grant execute on function public.reglages_entier_valide(jsonb, integer, integer) to authenticated, service_role;
grant execute on function public.reglages_booleen_valide(jsonb) to authenticated, service_role;
grant execute on function public.reglages_modules_config_valide(text, jsonb) to authenticated, service_role;

create table if not exists public.reglages_modules (
  etablissement_id  text        not null references public.etablissements(id) on delete cascade,
  module            text        not null,
  config            jsonb       not null default '{}'::jsonb,
  updated_at        timestamptz not null default now(),
  updated_by        text,
  constraint reglages_modules_pkey primary key (etablissement_id, module),
  constraint reglages_modules_module_check
    check (module in ('pertes', 'groupes', 'mep', 'fiches_salle', 'kds', 'catalogue')),
  constraint reglages_modules_taille_check check (octet_length(config::text) <= 20000),
  constraint reglages_modules_config_check check (public.reglages_modules_config_valide(module, config))
);

comment on table public.reglages_modules is
  'Réglages de chaque module, par établissement (lot 2). Une ligne absente vaut les valeurs par défaut du front.';

-- Auteur et heure de la dernière écriture, posés par la base. INVOKER : lit
-- l'identité de l'appelant.
create or replace function public.reglages_modules_avant_ecriture()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $fn$
begin
  new.updated_at := now();
  new.updated_by := (select auth.uid())::text;
  return new;
end;
$fn$;

revoke all on function public.reglages_modules_avant_ecriture() from public, anon, authenticated;

create or replace trigger trg_reglages_modules_avant_ecriture
  before insert or update on public.reglages_modules
  for each row execute function public.reglages_modules_avant_ecriture();

alter table public.reglages_modules enable row level security;
revoke all on table public.reglages_modules from public, anon, authenticated;
grant select, insert, update, delete on table public.reglages_modules to authenticated;

drop policy if exists reglages_modules_select on public.reglages_modules;
create policy reglages_modules_select on public.reglages_modules
  for select to authenticated
  using (user_can_access_etab(etablissement_id));

drop policy if exists reglages_modules_insert on public.reglages_modules;
create policy reglages_modules_insert on public.reglages_modules
  for insert to authenticated
  with check (user_can_access_etab(etablissement_id)
    and (select public.current_user_role()) in ('consultant', 'patron', 'resp_cuisine'));

drop policy if exists reglages_modules_update on public.reglages_modules;
create policy reglages_modules_update on public.reglages_modules
  for update to authenticated
  using (user_can_access_etab(etablissement_id)
    and (select public.current_user_role()) in ('consultant', 'patron', 'resp_cuisine'))
  with check (user_can_access_etab(etablissement_id)
    and (select public.current_user_role()) in ('consultant', 'patron', 'resp_cuisine'));

drop policy if exists reglages_modules_delete on public.reglages_modules;
create policy reglages_modules_delete on public.reglages_modules
  for delete to authenticated
  using (user_can_access_etab(etablissement_id)
    and (select public.current_user_role()) in ('consultant', 'patron', 'resp_cuisine'));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reglages_modules'
  ) then
    alter publication supabase_realtime add table public.reglages_modules;
  end if;
end $$;


-- =============================================================================
-- 3. mep_modeles
-- =============================================================================

-- Lignes d'un modèle, comme mep_items : { label (obligatoire, 120 caractères
-- au plus), recette_id, quantite (>= 0), unite (20 caractères au plus),
-- congelable (booléen) }. 200 lignes au plus.
create or replace function public.mep_modeles_lignes_valides(p jsonb)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $fn$
declare
  v_l jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'array' then return false; end if;
  if jsonb_array_length(p) > 200 then return false; end if;
  for v_l in select value from jsonb_array_elements(p) loop
    if jsonb_typeof(v_l) <> 'object' then return false; end if;
    if jsonb_typeof(v_l -> 'label') is distinct from 'string' then return false; end if;
    if btrim(v_l ->> 'label') = '' or char_length(v_l ->> 'label') > 120 then return false; end if;
    if v_l ? 'recette_id' and jsonb_typeof(v_l -> 'recette_id') not in ('string', 'null') then return false; end if;
    if v_l ? 'quantite' and jsonb_typeof(v_l -> 'quantite') not in ('number', 'null') then return false; end if;
    if jsonb_typeof(v_l -> 'quantite') = 'number' and (v_l ->> 'quantite')::numeric < 0 then return false; end if;
    if v_l ? 'unite' and jsonb_typeof(v_l -> 'unite') not in ('string', 'null') then return false; end if;
    if jsonb_typeof(v_l -> 'unite') = 'string' and char_length(v_l ->> 'unite') > 20 then return false; end if;
    if v_l ? 'congelable' and jsonb_typeof(v_l -> 'congelable') not in ('boolean', 'null') then return false; end if;
  end loop;
  return true;
end;
$fn$;

revoke all on function public.mep_modeles_lignes_valides(jsonb) from public, anon, authenticated;
grant execute on function public.mep_modeles_lignes_valides(jsonb) to authenticated, service_role;

create table if not exists public.mep_modeles (
  id                uuid        primary key default gen_random_uuid(),
  etablissement_id  text        not null references public.etablissements(id) on delete cascade,
  poste             text,
  nom               text        not null,
  lignes            jsonb       not null default '[]'::jsonb,
  ordre             integer     not null default 0,
  actif             boolean     not null default true,
  created_by        text        default (auth.uid())::text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint mep_modeles_nom_check check (btrim(nom) <> '' and char_length(nom) <= 80),
  constraint mep_modeles_poste_check check (poste is null or (btrim(poste) <> '' and char_length(poste) <= 40)),
  constraint mep_modeles_lignes_check check (public.mep_modeles_lignes_valides(lignes)),
  constraint mep_modeles_taille_check check (octet_length(lignes::text) <= 60000)
);

comment on table public.mep_modeles is
  'Modèles de liste de mise en place (lot 2). poste = nom d''un poste de reglages_modules (module mep), null = tous les postes.';

create index if not exists idx_mep_modeles_etab_poste on public.mep_modeles (etablissement_id, poste);

create or replace trigger trg_mep_modeles_updated_at
  before update on public.mep_modeles
  for each row execute function public.set_updated_at();

alter table public.mep_modeles enable row level security;
revoke all on table public.mep_modeles from public, anon, authenticated;
grant select, insert, update, delete on table public.mep_modeles to authenticated;

-- Lecture : les rôles qui lisent mep_listes (mep_listes_select).
drop policy if exists mep_modeles_select on public.mep_modeles;
create policy mep_modeles_select on public.mep_modeles
  for select to authenticated
  using (user_can_access_etab(etablissement_id)
    and (select public.current_user_role()) in ('consultant', 'patron', 'resp_cuisine', 'cuisinier'));

drop policy if exists mep_modeles_insert on public.mep_modeles;
create policy mep_modeles_insert on public.mep_modeles
  for insert to authenticated
  with check (user_can_access_etab(etablissement_id)
    and (select public.current_user_role()) in ('consultant', 'patron', 'resp_cuisine'));

drop policy if exists mep_modeles_update on public.mep_modeles;
create policy mep_modeles_update on public.mep_modeles
  for update to authenticated
  using (user_can_access_etab(etablissement_id)
    and (select public.current_user_role()) in ('consultant', 'patron', 'resp_cuisine'))
  with check (user_can_access_etab(etablissement_id)
    and (select public.current_user_role()) in ('consultant', 'patron', 'resp_cuisine'));

drop policy if exists mep_modeles_delete on public.mep_modeles;
create policy mep_modeles_delete on public.mep_modeles
  for delete to authenticated
  using (user_can_access_etab(etablissement_id)
    and (select public.current_user_role()) in ('consultant', 'patron', 'resp_cuisine'));


-- =============================================================================
-- 4. sops : rôle désigné et rappel
-- =============================================================================

alter table public.sops
  add column if not exists roles_designes text[] not null default '{}'::text[]
    constraint sops_roles_designes_check
    check (cardinality(roles_designes) <= 20
      and array_position(roles_designes, null) is null
      and '' <> all (roles_designes)),
  add column if not exists rappel_actif boolean not null default false,
  add column if not exists rappel_moment text
    constraint sops_rappel_moment_check
    check (rappel_moment is null
      or rappel_moment in ('ouverture', 'avant_service', 'apres_service', 'fermeture', 'heure')),
  add column if not exists rappel_heure time,
  add column if not exists rappel_jours smallint[]
    constraint sops_rappel_jours_check
    check (rappel_jours is null
      or (cardinality(rappel_jours) between 1 and 7 and rappel_jours <@ array[1,2,3,4,5,6,7]::smallint[]));

-- Un rappel allumé dit quand ; « heure » dit à quelle heure.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.sops'::regclass and conname = 'sops_rappel_coherent_check'
  ) then
    alter table public.sops add constraint sops_rappel_coherent_check
      check ((not rappel_actif or rappel_moment is not null)
        and (rappel_moment is distinct from 'heure' or rappel_heure is not null));
  end if;
end $$;

comment on column public.sops.roles_designes is 'Rôles qui font la procédure (lot 2). Vide = toute l''équipe.';
comment on column public.sops.rappel_moment is 'Moment du rappel : ouverture, avant_service, apres_service, fermeture, ou heure (rappel_heure).';
comment on column public.sops.rappel_jours is 'Jours du rappel, 1 = lundi à 7 = dimanche. Null = chaque jour où la fréquence le demande.';


-- =============================================================================
-- 5. fournisseurs : délai de paiement
-- =============================================================================

alter table public.fournisseurs
  add column if not exists delai_paiement_jours smallint
    constraint fournisseurs_delai_paiement_check
    check (delai_paiement_jours is null or delai_paiement_jours between 0 and 180);

comment on column public.fournisseurs.delai_paiement_jours is 'Délai de paiement propre au fournisseur, en jours. Null = délai par défaut de la maison (compta_reglages).';


-- Les colonnes de réglage ajoutées à sops et fournisseurs se règlent par la
-- direction de la maison, comme les autres réglages du lot : la RLS de ces
-- deux tables laisse écrire toute l'équipe (fiches et procédures du
-- quotidien), et elle ne filtre pas les colonnes. Le garde compare les
-- valeurs, pas leur présence : une écriture qui renvoie la ligne entière
-- sans changer ces colonnes passe (front déployé compris, qui ne les connaît
-- pas). Sans identité (service, migration, tâche planifiée) : rien à garder.
-- INVOKER : lit l'identité de l'appelant.
create or replace function public.lot2_colonnes_reglage_garde()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $fn$
declare
  v_change boolean := false;
begin
  if (select auth.uid()) is null then return new; end if;
  if (select public.current_user_role()) in ('consultant', 'patron', 'resp_cuisine') then return new; end if;

  if tg_table_name = 'fournisseurs' then
    if tg_op = 'INSERT' then
      v_change := new.delai_paiement_jours is not null;
    else
      v_change := new.delai_paiement_jours is distinct from old.delai_paiement_jours;
    end if;
  elsif tg_table_name = 'sops' then
    if tg_op = 'INSERT' then
      v_change := cardinality(new.roles_designes) > 0 or new.rappel_actif
        or new.rappel_moment is not null or new.rappel_heure is not null or new.rappel_jours is not null;
    else
      v_change := row(new.roles_designes, new.rappel_actif, new.rappel_moment, new.rappel_heure, new.rappel_jours)
        is distinct from row(old.roles_designes, old.rappel_actif, old.rappel_moment, old.rappel_heure, old.rappel_jours);
    end if;
  end if;

  if v_change then
    raise exception 'Réglage réservé à la direction de la maison' using errcode = '42501';
  end if;
  return new;
end;
$fn$;

revoke all on function public.lot2_colonnes_reglage_garde() from public, anon, authenticated;

create or replace trigger trg_fournisseurs_reglage_garde
  before insert or update on public.fournisseurs
  for each row execute function public.lot2_colonnes_reglage_garde();

create or replace trigger trg_sops_reglage_garde
  before insert or update on public.sops
  for each row execute function public.lot2_colonnes_reglage_garde();


-- =============================================================================
-- 7. compta_reglages : paiement par défaut, catégories de charges
-- =============================================================================

-- Catégories de charges de la maison : tableau (40 au plus) de
-- { id : ^[a-z0-9_]{1,40}$, distincts ; label : texte de 60 caractères au
-- plus }. Vide = les catégories de l'app (CATEGORIES_CHARGES du front).
create or replace function public.compta_categories_charges_valides(p jsonb)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $fn$
declare
  v_c    jsonb;
  v_id   text;
  v_ids  text[] := '{}';
begin
  if p is null or jsonb_typeof(p) <> 'array' then return false; end if;
  if jsonb_array_length(p) > 40 then return false; end if;
  for v_c in select value from jsonb_array_elements(p) loop
    if jsonb_typeof(v_c) <> 'object' then return false; end if;
    if jsonb_typeof(v_c -> 'id') is distinct from 'string' then return false; end if;
    if jsonb_typeof(v_c -> 'label') is distinct from 'string' then return false; end if;
    v_id := v_c ->> 'id';
    if v_id !~ '^[a-z0-9_]{1,40}$' then return false; end if;
    if v_id = any (v_ids) then return false; end if;
    v_ids := v_ids || v_id;
    if btrim(v_c ->> 'label') = '' or char_length(v_c ->> 'label') > 60 then return false; end if;
  end loop;
  return true;
end;
$fn$;

revoke all on function public.compta_categories_charges_valides(jsonb) from public, anon, authenticated;
grant execute on function public.compta_categories_charges_valides(jsonb) to authenticated, service_role;

alter table public.compta_reglages
  add column if not exists delai_paiement_jours smallint not null default 30
    constraint compta_reglages_delai_paiement_check check (delai_paiement_jours between 0 and 180),
  add column if not exists categories_charges jsonb not null default '[]'::jsonb
    constraint compta_reglages_categories_charges_check check (public.compta_categories_charges_valides(categories_charges));

comment on column public.compta_reglages.delai_paiement_jours is 'Délai de paiement par défaut des factures d''achat, en jours (lot 2). Un fournisseur peut avoir le sien.';
comment on column public.compta_reglages.categories_charges is 'Catégories de charges de la maison, [{id, label}]. Vide = catégories de l''app.';
