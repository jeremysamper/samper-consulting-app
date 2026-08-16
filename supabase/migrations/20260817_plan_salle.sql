-- ════════════════════════════════════════════════════════════════════════════
-- Plan de salle - tables physiques et placement des réservations
-- ───────────────────────────────────────────────────────────────────────────
-- Le module Prévisions sait combien de couverts arrivent et à quelle heure,
-- mais pas OÙ ils s'assoient. Le placement se fait aujourd'hui sur un plan
-- papier ou de tête : à l'arrivée d'un groupe personne ne sait quelle table
-- est libre, et une table donnée à deux réservations ne se voit qu'au moment
-- où les clients sont debout devant.
--
-- Deux tables :
--   • salle_tables       : le plan lui-même (les meubles), propre à
--                          l'établissement et stable dans le temps.
--   • reservation_tables : qui est placé où, pour un service donné.
--
-- POURQUOI UNE TABLE DE LIAISON ET NON UNE COLONNE `table_id` SUR reservations
-- Un groupe de 12 dans une maison qui n'a que des tables de 6 occupe deux
-- tables : c'est le cas courant, pas l'exception. Une colonne unique
-- obligerait à inventer une fausse « table 5+6 » dans le plan. La liaison
-- porte donc N tables par réservation, et symétriquement plusieurs
-- réservations peuvent partager une grande table (deux couples sur la
-- tablée d'hôtes). Aucune contrainte ne l'interdit : c'est au front
-- d'afficher le dépassement de capacité, pas à la base de le refuser — un
-- service se joue à la place près et la base n'a pas à bloquer l'hôte.
--
-- SYSTÈME DE COORDONNÉES
-- Les positions sont exprimées dans un canevas virtuel de 1000 × 700 unités,
-- jamais en pixels. Le plan doit tomber juste aussi bien sur l'iPad de
-- l'entrée que sur l'écran du bureau : le front met le canevas à l'échelle
-- de la largeur disponible et le ratio reste constant. Stocker des pixels
-- aurait figé le plan sur la taille d'écran de celui qui l'a dessiné.
--
-- Migration additive (expand) : deux tables isolées, aucune colonne ni
-- politique existante touchée. Un bundle déployé AVANT cette migration ne les
-- lit pas et continue de fonctionner à l'identique ; un bundle déployé APRÈS
-- mais sans les tables affiche un plan vide et l'invitation à le dessiner.
-- Idempotente, rejouable sans erreur. Rollback en fin de fichier.
--
-- RLS calquée sur `reservations` : lecture pour tout membre de
-- l'établissement (le cuisinier doit pouvoir lire le plan sans le modifier),
-- écriture pour consultant / patron / resp_cuisine / hôte — exactement les
-- rôles qui portent déjà le droit de créer une réservation, et les défauts de
-- `manage:previsions` côté front.
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. salle_tables - le plan
-- ─────────────────────────────────────────────────────────────────────────────
-- `id` en text avec défaut serveur, comme reservations : ces lignes sont
-- créées par le client Supabase typé (pas par le bridge legacy qui, lui,
-- génère ses ids côté JS).
--
-- Pas de FK vers un « service » : le mobilier ne change pas entre le midi et
-- le soir. Ce qui change d'un service à l'autre, c'est qui est assis dessus,
-- et ça vit dans reservation_tables.
create table if not exists public.salle_tables (
  id               text        primary key default (gen_random_uuid())::text,
  etablissement_id text        not null references public.etablissements(id) on delete cascade,
  nom              text        not null,                    -- « 12 », « T3 », « Bar 1 »
  nb_places        integer     not null default 2,
  forme            text        not null default 'ronde'
                               check (forme in ('ronde','carree','rectangle')),
  -- Coin haut-gauche dans le canevas virtuel 1000 × 700
  pos_x            numeric     not null default 0,
  pos_y            numeric     not null default 0,
  largeur          numeric     not null default 90,
  hauteur          numeric     not null default 90,
  zone             text,                                    -- « Salle », « Terrasse », « Véranda »
  actif            boolean     not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_salle_tables_etab
  on public.salle_tables(etablissement_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. reservation_tables - le placement
-- ─────────────────────────────────────────────────────────────────────────────
-- Pas de colonne date ni service : la réservation les porte déjà. Une liaison
-- est donc datée par construction, et supprimée avec sa réservation.
create table if not exists public.reservation_tables (
  id             text        primary key default (gen_random_uuid())::text,
  reservation_id text        not null references public.reservations(id)  on delete cascade,
  table_id       text        not null references public.salle_tables(id)  on delete cascade,
  created_at     timestamptz not null default now()
);

-- Deux fois la même table sur la même réservation n'est pas un placement,
-- c'est un double glisser-déposer. L'unicité rend l'opération idempotente :
-- le front peut rejouer une assignation sans créer de doublon.
create unique index if not exists uq_reservation_tables_resa_table
  on public.reservation_tables(reservation_id, table_id);

create index if not exists idx_reservation_tables_table
  on public.reservation_tables(table_id);

create index if not exists idx_reservation_tables_resa
  on public.reservation_tables(reservation_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Contraintes CHECK
-- ───────────────────────────────────────────────────────────────────────────
-- `ADD CONSTRAINT IF NOT EXISTS` n'existe pas en PostgreSQL : la garde
-- d'existence passe par un bloc DO, sinon la migration échoue au rejeu.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.salle_tables'::regclass
      and conname = 'salle_tables_nom_non_vide'
  ) then
    alter table public.salle_tables
      add constraint salle_tables_nom_non_vide
      check (btrim(nom) <> '');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.salle_tables'::regclass
      and conname = 'salle_tables_places_positives'
  ) then
    alter table public.salle_tables
      add constraint salle_tables_places_positives
      check (nb_places > 0 and nb_places <= 40);
  end if;

  -- Le canevas est borné : une table posée à x = 5000 serait invisible et
  -- irrécupérable au doigt. La borne haute laisse la place à la table
  -- elle-même (une table ne peut pas commencer au bord droit).
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.salle_tables'::regclass
      and conname = 'salle_tables_position_dans_canevas'
  ) then
    alter table public.salle_tables
      add constraint salle_tables_position_dans_canevas
      check (
        pos_x >= 0 and pos_x <= 1000
        and pos_y >= 0 and pos_y <= 700
        and largeur > 0 and largeur <= 1000
        and hauteur > 0 and hauteur <= 700
      );
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RLS
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.salle_tables       enable row level security;
alter table public.reservation_tables enable row level security;

-- ── salle_tables ──
drop policy if exists salle_tables_select on public.salle_tables;
create policy salle_tables_select on public.salle_tables
  for select to authenticated
  using (user_can_access_etab(etablissement_id));

drop policy if exists salle_tables_insert on public.salle_tables;
create policy salle_tables_insert on public.salle_tables
  for insert to authenticated
  with check (
    user_can_access_etab(etablissement_id)
    and current_user_role() = any(array['consultant','patron','resp_cuisine','hote'])
  );

drop policy if exists salle_tables_update on public.salle_tables;
create policy salle_tables_update on public.salle_tables
  for update to authenticated
  using (user_can_access_etab(etablissement_id)
         and current_user_role() = any(array['consultant','patron','resp_cuisine','hote']))
  with check (user_can_access_etab(etablissement_id)
              and current_user_role() = any(array['consultant','patron','resp_cuisine','hote']));

drop policy if exists salle_tables_delete on public.salle_tables;
create policy salle_tables_delete on public.salle_tables
  for delete to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and current_user_role() = any(array['consultant','patron','hote'])
  );

-- ── reservation_tables (accès hérité de la réservation parente, comme
--    reservation_tags) ──
drop policy if exists reservation_tables_select on public.reservation_tables;
create policy reservation_tables_select on public.reservation_tables
  for select to authenticated
  using (
    exists (
      select 1 from public.reservations r
      where r.id = reservation_id and user_can_access_etab(r.etablissement_id)
    )
  );

drop policy if exists reservation_tables_insert on public.reservation_tables;
create policy reservation_tables_insert on public.reservation_tables
  for insert to authenticated
  with check (
    exists (
      select 1 from public.reservations r
      where r.id = reservation_id
        and user_can_access_etab(r.etablissement_id)
        and current_user_role() = any(array['consultant','patron','resp_cuisine','hote'])
    )
    -- La table visée doit appartenir au MÊME établissement que la
    -- réservation : sans ce garde-fou, un utilisateur multi-établissements
    -- pourrait placer une résa du Rucher sur une table de Woodland.
    and exists (
      select 1 from public.salle_tables st
      join public.reservations r on r.id = reservation_id
      where st.id = table_id and st.etablissement_id = r.etablissement_id
    )
  );

drop policy if exists reservation_tables_delete on public.reservation_tables;
create policy reservation_tables_delete on public.reservation_tables
  for delete to authenticated
  using (
    exists (
      select 1 from public.reservations r
      where r.id = reservation_id
        and user_can_access_etab(r.etablissement_id)
        and current_user_role() = any(array['consultant','patron','resp_cuisine','hote'])
    )
  );

-- Pas de politique UPDATE sur reservation_tables : déplacer une réservation
-- d'une table à l'autre, c'est supprimer une liaison et en créer une autre.
-- Une ligne de liaison n'a rien à modifier.

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Realtime - ajout à la publication (idempotent)
-- ───────────────────────────────────────────────────────────────────────────
-- Le plan se joue à plusieurs en même temps : l'hôte place à l'entrée sur son
-- iPad pendant que le patron regarde le même plan depuis le bureau. Sans
-- realtime, chacun placerait sur une photo périmée du service et donnerait la
-- même table deux fois.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'salle_tables'
  ) then
    alter publication supabase_realtime add table public.salle_tables;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reservation_tables'
  ) then
    alter publication supabase_realtime add table public.reservation_tables;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Commentaires
-- ─────────────────────────────────────────────────────────────────────────────
comment on table public.salle_tables is
  'Plan de salle d''un établissement : une ligne = un meuble. Stable d''un service à l''autre ; c''est le placement (reservation_tables) qui change.';

comment on column public.salle_tables.pos_x is
  'Abscisse du coin haut-gauche dans le canevas virtuel 1000 × 700, jamais en pixels : le front met le canevas à l''échelle de la largeur disponible.';

comment on column public.salle_tables.actif is
  'Table inactive = conservée dans le plan mais retirée du placement (banquette démontée l''hiver, terrasse fermée).';

comment on table public.reservation_tables is
  'Placement : quelle réservation occupe quelle table. Plusieurs tables par réservation (un groupe de 12 sur deux tables de 6) et plusieurs réservations par table (tablée d''hôtes) sont volontairement permis ; le dépassement de capacité est signalé par le front, pas refusé par la base.';

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (à exécuter manuellement si besoin) :
--
--   do $$
--   begin
--     if exists (select 1 from pg_publication_tables
--                where pubname = 'supabase_realtime' and tablename = 'reservation_tables') then
--       alter publication supabase_realtime drop table public.reservation_tables;
--     end if;
--     if exists (select 1 from pg_publication_tables
--                where pubname = 'supabase_realtime' and tablename = 'salle_tables') then
--       alter publication supabase_realtime drop table public.salle_tables;
--     end if;
--   end $$;
--   drop table if exists public.reservation_tables;
--   drop table if exists public.salle_tables;
-- ════════════════════════════════════════════════════════════════════════════
