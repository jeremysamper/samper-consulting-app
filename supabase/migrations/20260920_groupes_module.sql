-- ════════════════════════════════════════════════════════════════════════════
-- Module Groupes - calendrier des événements de groupe et menus prédéfinis
-- ───────────────────────────────────────────────────────────────────────────
-- Un mariage de 80 couverts ne se prépare pas comme un service : il se
-- commande, se produit et se congèle deux semaines à l'avance. Aujourd'hui ces
-- événements vivent dans un agenda papier ou dans la tête du patron, et la
-- cuisine les découvre trop tard. Le module Prévisions ne convient pas : il
-- compte des couverts par service, il ne porte ni menu, ni suivi de
-- préparation.
--
-- Deux tables :
--   • groupe_menus      : les menus prédéfinis, numérotés de 1 à 5 pour chacun
--                         des cinq types de groupe (mariage, anniversaire,
--                         séminaire, groupe, apéro dînatoire).
--   • groupe_evenements : les groupes réservés, avec leur état de préparation.
--
-- ÉTAT DE PRÉPARATION (la couleur de la case du calendrier)
--   a_lire → rouge  : la brigade n'a pas encore pris connaissance du groupe
--   lu     → orange : lu, pas encore préparé
--   pret   → vert   : lu et préparé
-- Toute modification du CONTENU d'un groupe (date, menu, couverts, allergies,
-- commentaires…) le repasse en rouge : une case verte sur un groupe passé de
-- 60 à 90 couverts serait pire que pas de couleur du tout. Cette règle vit dans
-- un trigger et non dans le front, pour qu'aucun client ne puisse l'oublier.
--
-- QUI ÉCRIT QUOI
-- Le patron (et consultant / resp. cuisine / hôte) crée et modifie les groupes.
-- Toute la brigade, elle, doit pouvoir passer un groupe en « lu » puis en
-- « prêt » : c'est le principe même du code couleur. La politique UPDATE est
-- donc ouverte à tout membre de l'établissement, et c'est le trigger qui
-- refuse à un rôle non gestionnaire de toucher à autre chose qu'à l'état.
-- Pas de fonction SECURITY DEFINER : tout s'exécute avec les droits de
-- l'appelant.
--
-- COMPOSITION D'UN MENU EN JSONB
-- `lignes` = [{ id, section, platId, libelle, description, parPersonne }].
-- Même choix que recettes.ingredients : un menu se lit et s'écrit d'un bloc.
-- `platId` n'est volontairement PAS une clé étrangère : si le plat est supprimé
-- de la carte, la ligne garde son libellé et le menu reste imprimable ; seule
-- la liste de courses cesse de le chiffrer (et le front le signale).
--
-- Migration additive (expand) : deux tables isolées, aucune colonne ni
-- politique existante touchée. Un bundle déployé AVANT cette migration ne les
-- lit pas ; un bundle déployé APRÈS mais sans les tables affiche « module en
-- cours d'activation » au lieu d'une erreur. Idempotente, rejouable sans
-- erreur. Rollback en fin de fichier.
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. groupe_menus - les menus prédéfinis
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.groupe_menus (
  id               text        primary key default (gen_random_uuid())::text,
  etablissement_id text        not null references public.etablissements(id) on delete cascade,
  type_groupe      text        not null
                               check (type_groupe in ('mariage','anniversaire','seminaire','groupe','apero_dinatoire')),
  numero           integer     not null check (numero between 1 and 5),
  nom              text,                          -- intitulé libre : « Menu Prestige »
  prix_pax         numeric     check (prix_pax is null or prix_pax >= 0),
  description      text,
  lignes           jsonb       not null default '[]'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Un seul « mariage n°4 » par établissement : c'est ce qui permet au front
-- d'enregistrer un menu par upsert sur ce triplet, sans connaître son id.
create unique index if not exists uq_groupe_menus_etab_type_numero
  on public.groupe_menus(etablissement_id, type_groupe, numero);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. groupe_evenements - les groupes réservés
-- ─────────────────────────────────────────────────────────────────────────────
-- `menu_numero` peut rester vide : un mariage se réserve souvent des mois avant
-- que le menu soit arrêté. Le calendrier affiche alors « menu à définir ».
--
-- Le menu est référencé par (type_groupe, menu_numero) et non par l'id de
-- groupe_menus : « mariage n°4 » est le vocabulaire de la maison, et la
-- réservation doit rester lisible même si le menu n'a pas encore été composé.
--
-- Annulation = `annule`, jamais un DELETE depuis le front : un groupe annulé
-- par erreur au téléphone doit pouvoir être rétabli avec ses allergies.
create table if not exists public.groupe_evenements (
  id               text        primary key default (gen_random_uuid())::text,
  etablissement_id text        not null references public.etablissements(id) on delete cascade,
  date_evenement   date        not null,
  heure            time,
  type_groupe      text        not null
                               check (type_groupe in ('mariage','anniversaire','seminaire','groupe','apero_dinatoire')),
  menu_numero      integer     check (menu_numero is null or menu_numero between 1 and 5),
  nom              text        not null,          -- client ou nom de l'événement
  contact          text,                          -- téléphone ou e-mail
  nb_pax           integer     not null check (nb_pax > 0 and nb_pax <= 5000),
  -- Ids du référentiel partagé (src/utils/allergenes.js) uniquement. Toute
  -- nuance (« 2 végétariens », « cœliaque strict ») va dans allergies_note.
  allergenes_ids   text[]      not null default '{}',
  allergies_note   text,
  modifications    text,                          -- écarts par rapport au menu prédéfini
  commentaires     text,
  statut           text        not null default 'a_lire'
                               check (statut in ('a_lire','lu','pret')),
  lu_par           text,
  lu_at            timestamptz,
  pret_par         text,
  pret_at          timestamptz,
  modifie_at       timestamptz,                   -- dernière modification du contenu
  annule           boolean     not null default false,
  created_by       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Le calendrier lit un établissement sur une fenêtre de dates.
create index if not exists idx_groupe_evenements_etab_date
  on public.groupe_evenements(etablissement_id, date_evenement);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.groupe_evenements'::regclass
      and conname = 'groupe_evenements_nom_non_vide'
  ) then
    alter table public.groupe_evenements
      add constraint groupe_evenements_nom_non_vide
      check (btrim(nom) <> '');
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Triggers
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.groupe_menus_avant_maj()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_groupe_menus_avant_maj on public.groupe_menus;
create trigger trg_groupe_menus_avant_maj
  before update on public.groupe_menus
  for each row execute function public.groupe_menus_avant_maj();

create or replace function public.groupe_evenements_avant_insert()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Un groupe naît toujours « à lire », au nom de celui qui l'enregistre : sans
  -- ça un POST forgé pouvait créer un groupe déjà VERT, « préparé par » un
  -- tiers, qui échappait d'office à l'alerte d'anticipation. Hors session
  -- applicative (éditeur SQL, service role) l'insertion reste libre.
  if (select auth.uid()) is not null then
    new.created_by := (select auth.uid())::text;
    new.statut     := 'a_lire';
    new.lu_par     := null;
    new.lu_at      := null;
    new.pret_par   := null;
    new.pret_at    := null;
    new.modifie_at := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_groupe_evenements_avant_insert on public.groupe_evenements;
create trigger trg_groupe_evenements_avant_insert
  before insert on public.groupe_evenements
  for each row execute function public.groupe_evenements_avant_insert();

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
     new.modifications, new.commentaires, new.annule)
    is distinct from
    (old.date_evenement, old.heure, old.type_groupe, old.menu_numero, old.nom,
     old.contact, old.nb_pax, old.allergenes_ids, old.allergies_note,
     old.modifications, old.commentaires, old.annule);

  if contenu_change then
    -- Hors session applicative (éditeur SQL, service role : auth.uid() nul) on
    -- laisse passer, comme le fait la RLS pour ces appelants. On teste auth.uid()
    -- et non le rôle : current_user_role() rend '' - pas NULL - sans session, et
    -- un utilisateur connecté SANS profil ('' lui aussi) doit, lui, être refusé.
    role_courant := current_user_role();
    if (select auth.uid()) is not null
       and coalesce(role_courant, '') <> all (array['consultant','patron','resp_cuisine','hote']) then
      raise exception 'Seuls le patron, le responsable cuisine, l''hôte et le consultant peuvent modifier un groupe.'
        using errcode = '42501';
    end if;

    -- Ce que la brigade doit relire. Le nom et le contact du client n'en font
    -- pas partie : corriger un numéro de téléphone ne change rien en cuisine.
    a_relire :=
      (new.date_evenement, new.heure, new.type_groupe, new.menu_numero, new.nb_pax,
       new.allergenes_ids, new.allergies_note, new.modifications, new.commentaires)
      is distinct from
      (old.date_evenement, old.heure, old.type_groupe, old.menu_numero, old.nb_pax,
       old.allergenes_ids, old.allergies_note, old.modifications, old.commentaires)
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

drop trigger if exists trg_groupe_evenements_avant_maj on public.groupe_evenements;
create trigger trg_groupe_evenements_avant_maj
  before update on public.groupe_evenements
  for each row execute function public.groupe_evenements_avant_maj();

-- Ces fonctions ne servent qu'aux triggers : personne n'a à les appeler.
revoke all on function public.groupe_menus_avant_maj()         from public, anon, authenticated;
revoke all on function public.groupe_evenements_avant_insert() from public, anon, authenticated;
revoke all on function public.groupe_evenements_avant_maj()    from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RLS
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.groupe_menus      enable row level security;
alter table public.groupe_evenements enable row level security;

revoke all on public.groupe_menus      from anon;
revoke all on public.groupe_evenements from anon;

-- ── groupe_menus : lecture pour toute la brigade, composition réservée à ceux
--    qui décident de la carte ──
drop policy if exists groupe_menus_select on public.groupe_menus;
create policy groupe_menus_select on public.groupe_menus
  for select to authenticated
  using (user_can_access_etab(etablissement_id));

drop policy if exists groupe_menus_insert on public.groupe_menus;
create policy groupe_menus_insert on public.groupe_menus
  for insert to authenticated
  with check (
    user_can_access_etab(etablissement_id)
    and (select current_user_role()) = any(array['consultant','patron','resp_cuisine'])
  );

drop policy if exists groupe_menus_update on public.groupe_menus;
create policy groupe_menus_update on public.groupe_menus
  for update to authenticated
  using (user_can_access_etab(etablissement_id)
         and (select current_user_role()) = any(array['consultant','patron','resp_cuisine']))
  with check (user_can_access_etab(etablissement_id)
              and (select current_user_role()) = any(array['consultant','patron','resp_cuisine']));

drop policy if exists groupe_menus_delete on public.groupe_menus;
create policy groupe_menus_delete on public.groupe_menus
  for delete to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select current_user_role()) = any(array['consultant','patron','resp_cuisine'])
  );

-- ── groupe_evenements ──
drop policy if exists groupe_evenements_select on public.groupe_evenements;
create policy groupe_evenements_select on public.groupe_evenements
  for select to authenticated
  using (user_can_access_etab(etablissement_id));

drop policy if exists groupe_evenements_insert on public.groupe_evenements;
create policy groupe_evenements_insert on public.groupe_evenements
  for insert to authenticated
  with check (
    user_can_access_etab(etablissement_id)
    and (select current_user_role()) = any(array['consultant','patron','resp_cuisine','hote'])
  );

-- Ouverte à tout membre : c'est le trigger groupe_evenements_avant_maj qui
-- limite les rôles non gestionnaires au seul changement d'état.
drop policy if exists groupe_evenements_update on public.groupe_evenements;
create policy groupe_evenements_update on public.groupe_evenements
  for update to authenticated
  using (user_can_access_etab(etablissement_id))
  with check (user_can_access_etab(etablissement_id));

-- Suppression définitive : hors du parcours normal (le front annule), gardée
-- pour nettoyer une saisie de test.
drop policy if exists groupe_evenements_delete on public.groupe_evenements;
create policy groupe_evenements_delete on public.groupe_evenements
  for delete to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select current_user_role()) = any(array['consultant','patron'])
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Realtime
-- ─────────────────────────────────────────────────────────────────────────────
-- La case doit passer du rouge à l'orange sur l'iPad du passe au moment où le
-- chef tape « Lu » sur son téléphone.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'groupe_evenements'
  ) then
    alter publication supabase_realtime add table public.groupe_evenements;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'groupe_menus'
  ) then
    alter publication supabase_realtime add table public.groupe_menus;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Commentaires
-- ─────────────────────────────────────────────────────────────────────────────
comment on table public.groupe_menus is
  'Menus prédéfinis des groupes : cinq par type (mariage, anniversaire, séminaire, groupe, apéro dînatoire), uniques par (établissement, type, numéro).';

comment on column public.groupe_menus.lignes is
  'Composition : [{ id, section, platId, libelle, description, parPersonne }]. platId sans clé étrangère, le libellé survit à la suppression du plat.';

comment on table public.groupe_evenements is
  'Groupes réservés. statut = couleur de la case du calendrier (a_lire rouge, lu orange, pret vert) ; toute modification du contenu le repasse à a_lire (trigger).';

comment on column public.groupe_evenements.allergenes_ids is
  'Ids du référentiel partagé uniquement. Toute nuance en texte libre va dans allergies_note.';

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (à exécuter manuellement si besoin) :
--
--   do $$
--   begin
--     if exists (select 1 from pg_publication_tables
--                where pubname = 'supabase_realtime' and tablename = 'groupe_evenements') then
--       alter publication supabase_realtime drop table public.groupe_evenements;
--     end if;
--     if exists (select 1 from pg_publication_tables
--                where pubname = 'supabase_realtime' and tablename = 'groupe_menus') then
--       alter publication supabase_realtime drop table public.groupe_menus;
--     end if;
--   end $$;
--   drop table if exists public.groupe_evenements;
--   drop table if exists public.groupe_menus;
--   drop function if exists public.groupe_evenements_avant_maj();
--   drop function if exists public.groupe_evenements_avant_insert();
--   drop function if exists public.groupe_menus_avant_maj();
-- ════════════════════════════════════════════════════════════════════════════
