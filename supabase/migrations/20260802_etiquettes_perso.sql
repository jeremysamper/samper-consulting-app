-- ════════════════════════════════════════════════════════════════════════════
-- Etiquettes DLC personnalisees ("etiquettes maison") - poste d'etiquetage HACCP
-- ───────────────────────────────────────────────────────────────────────────
-- Une preparation courante qui n'a pas de fiche recette (fond blanc, pate a
-- crumble, marinade maison...) devait jusqu'ici sortir sur une case « Divers
-- 3 jours » : la DLC etait juste, mais le bac ne portait pas son nom. Cette
-- table donne a chaque etablissement sa propre liste d'etiquettes nommees,
-- reutilisables jour apres jour.
--
-- Les cases « Divers » restent codees en dur cote front (utils/etiquettesDlc.js)
-- et ne sont PAS migrees ici : elles valent pour tous les etablissements et
-- n'ont rien a faire dans un referentiel par etablissement.
--
-- Colonnes de durees identiques a celles de `recettes` (migration
-- 20260730_recettes_durees_vie) : le front traite une etiquette maison
-- exactement comme une fiche, sans un seul cas particulier dans le calcul de
-- DLC. duree_vie_congele_jours NULL = preparation non congelable, donc modes
-- surgelation et decongelation indisponibles.
--
-- Roles (matrice, alignee sur l'onglet Etiquettes DLC) :
--   • lecture           : consultant, patron, resp_cuisine, cuisinier
--   • creation          : consultant, patron, resp_cuisine, cuisinier
--     (le cuisinier doit pouvoir creer son etiquette au poste, en plein service)
--   • modification      : consultant, patron, resp_cuisine
--   • suppression       : consultant, patron, resp_cuisine
--     (corriger une duree deja utilisee par la brigade engage l'autocontrole :
--      c'est une decision de responsable, pas un geste de service)
--   • serveur, hote     : aucun acces
--
-- Migration additive (expand) : nouvelle table isolee, aucune colonne ni
-- politique existante touchee. Le front deploye ignore cette table et continue
-- de fonctionner a l'identique. Idempotente, rejouable sans erreur.
-- RLS via les helpers existants user_can_access_etab(text) et
-- current_user_role(). profiles.id est TEXT : le cast auth.uid()::text est deja
-- encapsule dans ces helpers.
-- Rollback en fin de fichier.
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Table
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.etiquettes_perso (
  id                        uuid        primary key default gen_random_uuid(),
  etablissement_id          text        not null references public.etablissements(id) on delete cascade,
  nom                       text        not null,
  duree_vie_jours           integer     not null default 3,
  duree_vie_congele_jours   integer     null,   -- NULL = non congelable
  duree_vie_decongele_jours integer     not null default 2,
  created_by                text,               -- profiles.id (TEXT)
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index if not exists idx_etiquettes_perso_etab
  on public.etiquettes_perso(etablissement_id);

-- Un seul jeu de durees par nom et par etablissement. Deux « Sauce bearnaise »
-- avec deux DLC differentes, c'est une non-conformite garantie le jour du
-- controle : le doublon est refuse en base, pas seulement dans le formulaire.
-- Casse et espaces de bord ignores, sinon « bearnaise » et « Bearnaise  »
-- passeraient tous les deux.
create unique index if not exists uq_etiquettes_perso_etab_nom
  on public.etiquettes_perso(etablissement_id, lower(btrim(nom)));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Contraintes CHECK
-- ───────────────────────────────────────────────────────────────────────────
-- `ADD CONSTRAINT IF NOT EXISTS` n'existe pas en PostgreSQL : la garde
-- d'existence passe par un bloc DO, sinon la migration echoue au rejeu.
-- `duree_vie_congele_jours > 0` ne rejette pas NULL (resultat UNKNOWN) : la
-- valeur metier « non congelable » reste autorisee.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.etiquettes_perso'::regclass
      and conname = 'etiquettes_perso_nom_non_vide'
  ) then
    alter table public.etiquettes_perso
      add constraint etiquettes_perso_nom_non_vide
      check (btrim(nom) <> '');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.etiquettes_perso'::regclass
      and conname = 'etiquettes_perso_duree_vie_jours_positive'
  ) then
    alter table public.etiquettes_perso
      add constraint etiquettes_perso_duree_vie_jours_positive
      check (duree_vie_jours > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.etiquettes_perso'::regclass
      and conname = 'etiquettes_perso_duree_vie_congele_jours_positive'
  ) then
    alter table public.etiquettes_perso
      add constraint etiquettes_perso_duree_vie_congele_jours_positive
      check (duree_vie_congele_jours > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.etiquettes_perso'::regclass
      and conname = 'etiquettes_perso_duree_vie_decongele_jours_positive'
  ) then
    alter table public.etiquettes_perso
      add constraint etiquettes_perso_duree_vie_decongele_jours_positive
      check (duree_vie_decongele_jours > 0);
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RLS
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.etiquettes_perso enable row level security;

drop policy if exists etiquettes_perso_select on public.etiquettes_perso;
create policy etiquettes_perso_select on public.etiquettes_perso
  for select to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and current_user_role() = any(array['consultant','patron','resp_cuisine','cuisinier'])
  );

-- Creation ouverte au cuisinier : il etiquette au poste et doit pouvoir nommer
-- son bac sans attendre son responsable.
drop policy if exists etiquettes_perso_insert on public.etiquettes_perso;
create policy etiquettes_perso_insert on public.etiquettes_perso
  for insert to authenticated
  with check (
    user_can_access_etab(etablissement_id)
    and current_user_role() = any(array['consultant','patron','resp_cuisine','cuisinier'])
  );

-- Modification et suppression a partir du responsable cuisine : le cuisinier ne
-- peut pas changer une duree de vie deja en service. Miroir exact de la garde
-- d'interface (canGererEtiquettes dans EtiquettesDlc.jsx) : le front cache les
-- boutons, la base refuse l'ecriture.
drop policy if exists etiquettes_perso_update on public.etiquettes_perso;
create policy etiquettes_perso_update on public.etiquettes_perso
  for update to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and current_user_role() = any(array['consultant','patron','resp_cuisine'])
  )
  with check (
    user_can_access_etab(etablissement_id)
    and current_user_role() = any(array['consultant','patron','resp_cuisine'])
  );

drop policy if exists etiquettes_perso_delete on public.etiquettes_perso;
create policy etiquettes_perso_delete on public.etiquettes_perso
  for delete to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and current_user_role() = any(array['consultant','patron','resp_cuisine'])
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Realtime - ajout a la publication (idempotent)
-- ───────────────────────────────────────────────────────────────────────────
-- L'onglet Etiquettes DLC recharge sa liste sur event : une etiquette creee sur
-- l'iPad du chaud apparait au poste froid sans rechargement de page.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'etiquettes_perso'
  ) then
    alter publication supabase_realtime add table public.etiquettes_perso;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Commentaires
-- ─────────────────────────────────────────────────────────────────────────────
comment on table public.etiquettes_perso is
  'Etiquettes DLC nommees propres a un etablissement, pour les preparations sans fiche recette. Alimentent l''onglet Etiquettes DLC du module HACCP.';

comment on column public.etiquettes_perso.duree_vie_jours is
  'Duree de vie en froid positif, en jours. Relevee de l''autocontrole, jamais calculee par le systeme.';

comment on column public.etiquettes_perso.duree_vie_congele_jours is
  'Duree de vie en surgele, en jours. NULL signifie preparation non congelable : les modes surgelation et decongelation sont alors indisponibles.';

comment on column public.etiquettes_perso.duree_vie_decongele_jours is
  'Duree de vie apres decongelation, en jours. Defaut 2. Pertinente uniquement si la preparation est congelable.';

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (a executer manuellement si besoin) :
--
--   do $$
--   begin
--     if exists (
--       select 1 from pg_publication_tables
--       where pubname = 'supabase_realtime' and tablename = 'etiquettes_perso'
--     ) then
--       alter publication supabase_realtime drop table public.etiquettes_perso;
--     end if;
--   end $$;
--   drop table if exists public.etiquettes_perso;
-- ════════════════════════════════════════════════════════════════════════════
