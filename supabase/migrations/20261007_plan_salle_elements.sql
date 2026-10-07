-- ════════════════════════════════════════════════════════════════════════════
-- Plan de salle : décor de la salle (murs, baies, bar, accueil...) et places
-- de bar
-- ───────────────────────────────────────────────────────────────────────────
-- Demande de Jérémy (07.10.2026) : dessiner la salle autour des tables (murs,
-- baies vitrées, porte, bar, banque d'accueil...) et poser des places de bar,
-- plus petites qu'une table.
--
-- 1. salle_elements : le décor d'une salle, une ligne par élément dessiné.
--    Table À PART de salle_tables, volontairement : une table reçoit des
--    réservations (reservation_tables), compte ses places, porte un numéro et
--    s'ajuste pour un service (salle_tables_service). Un mur ne fait rien de
--    tout ça ; le ranger avec les tables obligerait chaque calcul de placement
--    et de capacité à l'écarter.
--    Même canevas virtuel 1000 × 700 que salle_tables, mêmes droits
--    d'écriture (user_peut_gerer('previsions', ...)), même temps réel.
--    rotation : seul le dessin de la porte en dépend (côté des gonds et sens
--    d'ouverture). Pour les autres éléments, le quart de tour échange
--    simplement largeur et hauteur, comme pour une table.
--
-- 2. salle_tables.forme accepte 'tabouret' : une place de bar EST une table
--    (on y assied une réservation, elle compte ses places), dessinée petite.
--
-- Migration additive (expand) : une table isolée et une contrainte élargie.
-- Le front déployé avant elle ne lit pas salle_elements et n'écrit jamais
-- 'tabouret' ; le nouveau front sans elle masque le décor et la place de bar.
-- Idempotente. Rollback en fin.
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. salle_elements
-- ─────────────────────────────────────────────────────────────────────────────
-- `id` en text avec défaut serveur, comme salle_tables. `salle_id` NOT NULL :
-- un élément de décor n'existe que dans une salle (le front en crée une avant
-- de poser quoi que ce soit dans un plan sans salle).
create table if not exists public.salle_elements (
  id               text        primary key default (gen_random_uuid())::text,
  etablissement_id text        not null references public.etablissements(id) on delete cascade,
  salle_id         text        not null references public.salles(id) on delete cascade,
  type             text        not null,
  libelle          text,
  pos_x            numeric     not null default 0,
  pos_y            numeric     not null default 0,
  largeur          numeric     not null default 100,
  hauteur          numeric     not null default 10,
  rotation         smallint    not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_salle_elements_etab
  on public.salle_elements(etablissement_id);

create index if not exists idx_salle_elements_salle
  on public.salle_elements(salle_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Contraintes (garde d'existence : ADD CONSTRAINT IF NOT EXISTS n'existe
--    pas en PostgreSQL)
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.salle_elements'::regclass
      and conname = 'salle_elements_type_connu'
  ) then
    alter table public.salle_elements
      add constraint salle_elements_type_connu
      check (type in ('mur', 'baie', 'porte', 'bar', 'accueil', 'pilier', 'plante', 'zone'));
  end if;

  -- Mêmes bornes que salle_tables : un élément posé hors du canevas serait
  -- invisible et irrécupérable au doigt.
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.salle_elements'::regclass
      and conname = 'salle_elements_position_dans_canevas'
  ) then
    alter table public.salle_elements
      add constraint salle_elements_position_dans_canevas
      check (
        pos_x >= 0 and pos_x <= 1000
        and pos_y >= 0 and pos_y <= 700
        and largeur > 0 and largeur <= 1000
        and hauteur > 0 and hauteur <= 700
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.salle_elements'::regclass
      and conname = 'salle_elements_rotation_quart'
  ) then
    alter table public.salle_elements
      add constraint salle_elements_rotation_quart
      check (rotation in (0, 90, 180, 270));
  end if;

  -- Libellé facultatif (zone « Cuisine », bar « Bar à vins ») : la branche
  -- `is null` est écrite, la longueur n'est comparée que s'il existe.
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.salle_elements'::regclass
      and conname = 'salle_elements_libelle_court'
  ) then
    alter table public.salle_elements
      add constraint salle_elements_libelle_court
      check (libelle is null or char_length(libelle) <= 60);
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RLS : lecture pour tout membre de l'établissement, écriture selon le
--    droit de gérer les prévisions (comme salles et salle_tables depuis
--    20261001_reservations_droit_modifier).
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.salle_elements enable row level security;

drop policy if exists salle_elements_select on public.salle_elements;
create policy salle_elements_select on public.salle_elements
  for select to authenticated
  using (user_can_access_etab(etablissement_id));

-- La salle visée doit appartenir au MÊME établissement que la ligne : sans ce
-- garde-fou, un compte multi-établissements pourrait poser un mur dans une
-- salle de Woodland sous l'établissement du Rucher.
drop policy if exists salle_elements_insert on public.salle_elements;
create policy salle_elements_insert on public.salle_elements
  for insert to authenticated
  with check (
    user_can_access_etab(etablissement_id)
    and exists (
      select 1 from public.salles s
      where s.id = salle_elements.salle_id
        and s.etablissement_id = salle_elements.etablissement_id
    )
    and (select public.user_peut_gerer('previsions', array['consultant', 'patron', 'resp_cuisine', 'hote']))
  );

drop policy if exists salle_elements_update on public.salle_elements;
create policy salle_elements_update on public.salle_elements
  for update to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('previsions', array['consultant', 'patron', 'resp_cuisine', 'hote']))
  )
  with check (
    user_can_access_etab(etablissement_id)
    and exists (
      select 1 from public.salles s
      where s.id = salle_elements.salle_id
        and s.etablissement_id = salle_elements.etablissement_id
    )
    and (select public.user_peut_gerer('previsions', array['consultant', 'patron', 'resp_cuisine', 'hote']))
  );

drop policy if exists salle_elements_delete on public.salle_elements;
create policy salle_elements_delete on public.salle_elements
  for delete to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('previsions', array['consultant', 'patron', 'resp_cuisine', 'hote']))
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Temps réel : le plan dessiné au bureau apparaît sur l'iPad de l'entrée.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'salle_elements'
  ) then
    alter publication supabase_realtime add table public.salle_elements;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Places de bar : forme 'tabouret' admise pour une table
-- ─────────────────────────────────────────────────────────────────────────────
-- Contrainte nommée automatiquement à la création de salle_tables
-- (salle_tables_forme_check, relevée en base le 07.10.2026). La retirer puis
-- la reposer élargie reste idempotent ; toutes les lignes existantes ont une
-- des trois anciennes formes, la revalidation passe.
alter table public.salle_tables drop constraint if exists salle_tables_forme_check;
alter table public.salle_tables
  add constraint salle_tables_forme_check
  check (forme in ('ronde', 'carree', 'rectangle', 'tabouret'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Commentaires
-- ─────────────────────────────────────────────────────────────────────────────
comment on table public.salle_elements is
  'Décor du plan de salle (mur, baie vitrée, porte, bar, banque d''accueil, pilier, plante, zone nommée). Dessiné autour des tables, ne reçoit aucune réservation.';

comment on column public.salle_elements.rotation is
  'Quart de tour (0, 90, 180, 270). Seul le dessin de la porte en dépend ; pour les autres, largeur et hauteur portent déjà l''orientation.';

comment on column public.salle_tables.forme is
  'ronde, carree, rectangle, ou tabouret (place de bar, dessinée petite).';

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (à exécuter manuellement si besoin, une fois le front qui les lit
-- retiré) :
--
--   update public.salle_tables set forme = 'ronde' where forme = 'tabouret';
--   alter table public.salle_tables drop constraint if exists salle_tables_forme_check;
--   alter table public.salle_tables
--     add constraint salle_tables_forme_check
--     check (forme in ('ronde', 'carree', 'rectangle'));
--   do $$
--   begin
--     if exists (select 1 from pg_publication_tables
--                where pubname = 'supabase_realtime' and tablename = 'salle_elements') then
--       alter publication supabase_realtime drop table public.salle_elements;
--     end if;
--   end $$;
--   drop table if exists public.salle_elements;
-- ════════════════════════════════════════════════════════════════════════════
