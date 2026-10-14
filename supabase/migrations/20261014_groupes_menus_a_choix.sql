-- ════════════════════════════════════════════════════════════════════════════
-- Groupes : menus à choix, deux saisons, choix du client
-- ───────────────────────────────────────────────────────────────────────────
-- Les menus de groupe de la maison ne sont plus des menus fixes : ce sont des
-- cartes dans lesquelles le client coche. Un groupe au restaurant retient une
-- entrée, un plat et un dessert pour toute la table ; un mariage retient trois
-- entrées et trois plats, puis chaque convive choisit le sien. Chaque menu
-- existe en deux saisons (mai à septembre, octobre à avril) au même prix.
--
-- MODÈLE
--   - Un menu (type, numéro) reste un PALIER DE PRIX : « mariage n°2 » est le
--     menu à 95 CHF toute l'année. La saison est portée par chaque ligne du
--     jsonb `lignes` (champ `saison`, fenêtre `moisDebut` / `moisFin`), pas par
--     le menu : un groupe déjà réservé garde sa référence (type, numéro), et la
--     date du groupe choisit d'elle-même les plats de la bonne saison.
--   - groupe_menus.regles : la règle de choix de chaque rubrique (servi
--     d'office, au choix pour toute la table, carte pour les convives, en
--     quantités) et l'apéritif conseillé de chaque saison. jsonb, comme les
--     lignes : le menu se lit et s'écrit d'un bloc.
--   - Numéros 0 à 12 : les groupes ont six menus, et le n°0 porte la carte des
--     compléments d'un type (pour le mariage : apéritif, stations, gâteau,
--     mignardises), partagée par tous ses menus.
--   - groupe_evenements.choix : ce que le client a coché, rubrique par
--     rubrique, avec les quantités par plat quand chaque convive choisit, et
--     les plats empruntés à un autre menu à titre exceptionnel (supplément par
--     personne saisi à la main).
--   - nb_vegetariens, nb_enfants : les végétariens reçoivent la version
--     végétarienne d'un plat choisi pour la table ; les enfants ont leur menu.
--
-- RELECTURE PAR LA BRIGADE
-- Changer un choix, le nombre de végétariens ou d'enfants change ce que la
-- cuisine produit : le groupe repasse en rouge, comme pour le reste du contenu.
-- Le déclencheur groupe_evenements_avant_maj reprend à l'identique la version
-- en production (20260926, cuisinier compris) et ajoute ces trois colonnes à
-- ses deux comparaisons. Aucun autre changement de droits.
--
-- Migration additive (expand) : colonnes nouvelles avec défaut, contraintes de
-- numéro élargies (1 à 5 devient 0 à 12 et 1 à 12). Le front déployé avant
-- elle n'écrit pas ces colonnes et ne lit que les numéros 1 à 5 : il reste
-- compatible. Idempotente, rejouable. Rollback en fin de fichier.
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. groupe_menus
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.groupe_menus
  add column if not exists regles jsonb not null default '{}'::jsonb;

alter table public.groupe_menus drop constraint if exists groupe_menus_numero_check;
alter table public.groupe_menus
  add constraint groupe_menus_numero_check check (numero between 0 and 12);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.groupe_menus'::regclass
      and conname = 'groupe_menus_regles_objet'
  ) then
    alter table public.groupe_menus
      add constraint groupe_menus_regles_objet
      check (jsonb_typeof(regles) = 'object');
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. groupe_evenements
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.groupe_evenements
  add column if not exists choix          jsonb   not null default '{}'::jsonb,
  add column if not exists nb_vegetariens integer,
  add column if not exists nb_enfants     integer;

alter table public.groupe_evenements drop constraint if exists groupe_evenements_menu_numero_check;
alter table public.groupe_evenements
  add constraint groupe_evenements_menu_numero_check
  check (menu_numero is null or menu_numero between 1 and 12);

-- Bornes écrites colonne par colonne avec leur « is null » : un CHECK qui vaut
-- NULL laisse passer la ligne, il faut donc dire explicitement que la valeur
-- vide est admise et que toute valeur présente est bornée.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.groupe_evenements'::regclass
      and conname = 'groupe_evenements_choix_objet'
  ) then
    alter table public.groupe_evenements
      add constraint groupe_evenements_choix_objet
      check (jsonb_typeof(choix) = 'object');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.groupe_evenements'::regclass
      and conname = 'groupe_evenements_vegetariens_borne'
  ) then
    alter table public.groupe_evenements
      add constraint groupe_evenements_vegetariens_borne
      check (nb_vegetariens is null or (nb_vegetariens >= 0 and nb_vegetariens <= nb_pax));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.groupe_evenements'::regclass
      and conname = 'groupe_evenements_enfants_borne'
  ) then
    alter table public.groupe_evenements
      add constraint groupe_evenements_enfants_borne
      check (nb_enfants is null or (nb_enfants >= 0 and nb_enfants <= nb_pax));
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Déclencheur : les choix font partie du contenu à relire
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.groupe_evenements_avant_maj()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  contenu_change boolean;
  a_relire       boolean := false;
  role_courant   text;
begin
  if new.etablissement_id is distinct from old.etablissement_id then
    raise exception 'Un groupe ne change pas d''établissement.' using errcode = '42501';
  end if;

  -- Tout ce qui n'est pas l'état de préparation.
  contenu_change :=
    (new.date_evenement, new.heure, new.type_groupe, new.menu_numero, new.nom,
     new.contact, new.nb_pax, new.allergenes_ids, new.allergies_note,
     new.modifications, new.commentaires, new.annule,
     new.choix, new.nb_vegetariens, new.nb_enfants)
    is distinct from
    (old.date_evenement, old.heure, old.type_groupe, old.menu_numero, old.nom,
     old.contact, old.nb_pax, old.allergenes_ids, old.allergies_note,
     old.modifications, old.commentaires, old.annule,
     old.choix, old.nb_vegetariens, old.nb_enfants);

  if contenu_change then
    -- Hors session applicative (éditeur SQL, service role : auth.uid() nul) on
    -- laisse passer, comme le fait la RLS pour ces appelants. On teste auth.uid()
    -- et non le rôle : current_user_role() rend '' - pas NULL - sans session, et
    -- un utilisateur connecté SANS profil ('' lui aussi) doit, lui, être refusé.
    role_courant := current_user_role();
    if (select auth.uid()) is not null
       and coalesce(role_courant, '') <> all (array['consultant','patron','resp_cuisine','hote','cuisinier']) then
      raise exception 'Seuls le patron, le responsable cuisine, le cuisinier, l''hôte et le consultant peuvent modifier un groupe.'
        using errcode = '42501';
    end if;

    -- Ce que la brigade doit relire. Le nom et le contact du client n'en font
    -- pas partie : corriger un numéro de téléphone ne change rien en cuisine.
    -- Les choix du client, eux, changent ce qui est produit.
    a_relire :=
      (new.date_evenement, new.heure, new.type_groupe, new.menu_numero, new.nb_pax,
       new.allergenes_ids, new.allergies_note, new.modifications, new.commentaires,
       new.choix, new.nb_vegetariens, new.nb_enfants)
      is distinct from
      (old.date_evenement, old.heure, old.type_groupe, old.menu_numero, old.nb_pax,
       old.allergenes_ids, old.allergies_note, old.modifications, old.commentaires,
       old.choix, old.nb_vegetariens, old.nb_enfants)
      -- Rétablir un groupe annulé : pendant l'annulation la brigade a pu
      -- réaffecter ce qu'elle avait produit. La case ne revient pas verte.
      or (old.annule and not new.annule);

    if a_relire then
      new.statut     := 'a_lire';
      new.lu_par     := null;
      new.lu_at      := null;
      new.pret_par   := null;
      new.pret_at    := null;
      new.modifie_at := now();
    end if;
  end if;

  -- Horodatage de l'état, posé ici et non par le client : l'heure d'une
  -- tablette n'est pas une preuve, et « lu par » ne doit pas être falsifiable.
  if not a_relire and new.statut is distinct from old.statut then
    if new.statut = 'lu' then
      if old.lu_at is null then
        new.lu_par := (select auth.uid())::text;
        new.lu_at  := now();
      else
        new.lu_par := old.lu_par;
        new.lu_at  := old.lu_at;
      end if;
      new.pret_par := null;
      new.pret_at  := null;
    elsif new.statut = 'pret' then
      if old.lu_at is null then
        new.lu_par := (select auth.uid())::text;
        new.lu_at  := now();
      else
        new.lu_par := old.lu_par;
        new.lu_at  := old.lu_at;
      end if;
      new.pret_par := (select auth.uid())::text;
      new.pret_at  := now();
    else
      new.lu_par   := null;
      new.lu_at    := null;
      new.pret_par := null;
      new.pret_at  := null;
    end if;
  elsif not a_relire then
    -- État inchangé : les horodatages ne sont pas modifiables à la main.
    new.lu_par   := old.lu_par;
    new.lu_at    := old.lu_at;
    new.pret_par := old.pret_par;
    new.pret_at  := old.pret_at;
  end if;

  -- Colonnes système : jamais modifiables par un UPDATE, quel que soit le rôle.
  -- La politique UPDATE est ouverte à toute la brigade (pour l'état) ; sans ce
  -- gel un PATCH forgé pouvait changer la clé primaire ou antidater modifie_at.
  new.id         := old.id;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  if not a_relire then
    new.modifie_at := old.modifie_at;
  end if;

  new.updated_at := now();
  return new;
end $$;

revoke all on function public.groupe_evenements_avant_maj() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Commentaires
-- ─────────────────────────────────────────────────────────────────────────────
comment on table public.groupe_menus is
  'Menus des groupes : un menu par palier de prix (type, numéro 1 à 12), la saison est portée par chaque ligne. Le numéro 0 est la carte des compléments du type (apéritif, stations, gâteau, mignardises).';

comment on column public.groupe_menus.lignes is
  'Composition : [{ id, section, rubrique, platId, recetteIds, libelle, description, parPersonne, regime, saison, moisDebut, moisFin, premium, chaud, prix, unite, portionsParUnite, minimum }]. platId sans clé étrangère, le libellé survit à la suppression du plat.';

comment on column public.groupe_menus.regles is
  'Règles de choix : { sections: { <section>: { mode servi|table|carte|quantites, nombre, retenir, vege, parPersonne, auMoinsChaud, puiserDans, facultatif, formules } }, aperitifConseille: { ete: [ids], hiver: [ids] } }.';

comment on column public.groupe_evenements.choix is
  'Choix du client : { formules: { <section>: id }, sections: { <section>: { items: [{ id, libelle, quantite }], vege: { id, libelle } } }, emprunts: [{ id, section, source, libelle, platId, recetteIds, regime, supplement }] }. Un emprunt est un plat pris dans un autre menu, supplément par personne saisi à la main.';

comment on column public.groupe_evenements.nb_vegetariens is
  'Convives végétariens, compris dans nb_pax. Ils reçoivent la version végétarienne d''un plat choisi pour toute la table.';

comment on column public.groupe_evenements.nb_enfants is
  'Enfants, compris dans nb_pax, servis du menu enfant : hors des plats du menu.';

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (à exécuter manuellement si besoin, après avoir vérifié qu'aucun
-- menu n'utilise un numéro hors de 1 à 5) :
--
--   D'ABORD rejouer la fonction groupe_evenements_avant_maj de
--   20260926_groupes_ouverts_cuisinier.sql : la version ci-dessus lit les
--   colonnes choix, nb_vegetariens et nb_enfants, tout UPDATE échouerait une
--   fois ces colonnes supprimées.
--   alter table public.groupe_evenements drop constraint if exists groupe_evenements_enfants_borne;
--   alter table public.groupe_evenements drop constraint if exists groupe_evenements_vegetariens_borne;
--   alter table public.groupe_evenements drop constraint if exists groupe_evenements_choix_objet;
--   alter table public.groupe_evenements drop column if exists nb_enfants;
--   alter table public.groupe_evenements drop column if exists nb_vegetariens;
--   alter table public.groupe_evenements drop column if exists choix;
--   alter table public.groupe_evenements drop constraint if exists groupe_evenements_menu_numero_check;
--   alter table public.groupe_evenements add constraint groupe_evenements_menu_numero_check
--     check (menu_numero is null or menu_numero between 1 and 5);
--   alter table public.groupe_menus drop constraint if exists groupe_menus_regles_objet;
--   alter table public.groupe_menus drop column if exists regles;
--   alter table public.groupe_menus drop constraint if exists groupe_menus_numero_check;
--   alter table public.groupe_menus add constraint groupe_menus_numero_check
--     check (numero between 1 and 5);
-- ════════════════════════════════════════════════════════════════════════════
