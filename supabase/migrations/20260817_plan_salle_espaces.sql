-- ════════════════════════════════════════════════════════════════════════════
-- Plan de salle - plusieurs salles par établissement
-- ───────────────────────────────────────────────────────────────────────────
-- La première version du plan tenait sur un seul canevas et rangeait
-- l'emplacement dans un champ texte libre `zone`. Ça ne tient pas debout dès
-- qu'une maison a une véranda, une terrasse et un carnotzet : tout se
-- superpose sur le même plan, et deux personnes qui écrivent « terrasse » et
-- « Terrasse » créent deux emplacements pour le même endroit.
--
-- Cette migration introduit `salles` : une vraie entité, un plan par salle,
-- et un onglet par salle dans le module. `zone` reste en place mais n'est
-- plus lue par le front (expand/contract : on ajoute, on migre les lectures,
-- on supprimera plus tard s'il y a lieu).
--
-- REPRISE DE L'EXISTANT
-- Les salles sont créées À PARTIR des valeurs déjà saisies dans `zone` :
-- une maison qui avait tapé « Terrasse » retrouve sa terrasse comme salle,
-- sans ressaisie. Les tables sans zone atterrissent dans une salle
-- « Salle » créée pour l'occasion. Aucune table ne reste orpheline.
--
-- Migration additive et idempotente, rejouable sans erreur. Elle s'applique
-- que 20260817_plan_salle.sql ait été passé juste avant ou de longue date.
-- Rollback en fin de fichier.
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Garde : rien à faire si le plan de salle n'existe pas encore
-- ───────────────────────────────────────────────────────────────────────────
-- Permet de rejouer tout le dossier de migrations dans l'ordre sans supposer
-- que la précédente a déjà tourné dans la même transaction.
do $$
begin
  if to_regclass('public.salle_tables') is null then
    raise exception 'public.salle_tables absente : appliquer 20260817_plan_salle.sql avant celle-ci.';
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Table salles
-- ─────────────────────────────────────────────────────────────────────────────
-- `ordre` : l'ordre des onglets est un choix de maison (on veut la salle
-- principale en premier, pas l'ordre alphabétique qui mettrait « Bar » avant
-- « Salle »). Tri côté client sur cette colonne, comme pour les cartes.
create table if not exists public.salles (
  id               text        primary key default (gen_random_uuid())::text,
  etablissement_id text        not null references public.etablissements(id) on delete cascade,
  nom              text        not null,
  ordre            integer     not null default 0,
  actif            boolean     not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_salles_etab on public.salles(etablissement_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.salles'::regclass and conname = 'salles_nom_non_vide'
  ) then
    alter table public.salles add constraint salles_nom_non_vide check (btrim(nom) <> '');
  end if;
end $$;

-- Deux salles du même nom dans la même maison, c'est une erreur de saisie :
-- les onglets deviendraient indiscernables.
create unique index if not exists uq_salles_etab_nom
  on public.salles(etablissement_id, lower(btrim(nom)));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Rattachement des tables
-- ─────────────────────────────────────────────────────────────────────────────
-- Colonne NULLABLE : un bundle déployé avant cette migration insère des
-- tables sans salle_id et doit continuer de fonctionner. Le front récent
-- renseigne toujours la colonne ; les éventuels orphelins sont rattachés à
-- la première salle au chargement.
alter table public.salle_tables
  add column if not exists salle_id text references public.salles(id) on delete cascade;

create index if not exists idx_salle_tables_salle on public.salle_tables(salle_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Reprise : une salle par `zone` distincte, puis rattachement
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  r record;
  v_salle_id text;
begin
  -- 3.1  Une salle par zone nommée
  for r in
    select distinct etablissement_id, btrim(zone) as zone
      from public.salle_tables
     where zone is not null and btrim(zone) <> ''
  loop
    insert into public.salles (etablissement_id, nom, ordre)
    values (r.etablissement_id, r.zone, 0)
    on conflict do nothing;

    select id into v_salle_id
      from public.salles
     where etablissement_id = r.etablissement_id
       and lower(btrim(nom)) = lower(r.zone)
     limit 1;

    update public.salle_tables
       set salle_id = v_salle_id
     where etablissement_id = r.etablissement_id
       and btrim(coalesce(zone, '')) = r.zone
       and salle_id is null;
  end loop;

  -- 3.2  Une salle « Salle » pour tout ce qui n'avait pas de zone
  for r in
    select distinct etablissement_id
      from public.salle_tables
     where salle_id is null
  loop
    insert into public.salles (etablissement_id, nom, ordre)
    values (r.etablissement_id, 'Salle', -1)   -- -1 : reste en tête des onglets
    on conflict do nothing;

    select id into v_salle_id
      from public.salles
     where etablissement_id = r.etablissement_id
       and lower(btrim(nom)) = 'salle'
     limit 1;

    update public.salle_tables
       set salle_id = v_salle_id
     where etablissement_id = r.etablissement_id
       and salle_id is null;
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RLS - calquée sur salle_tables
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.salles enable row level security;

drop policy if exists salles_select on public.salles;
create policy salles_select on public.salles
  for select to authenticated
  using (user_can_access_etab(etablissement_id));

drop policy if exists salles_insert on public.salles;
create policy salles_insert on public.salles
  for insert to authenticated
  with check (
    user_can_access_etab(etablissement_id)
    and current_user_role() = any(array['consultant','patron','resp_cuisine','hote'])
  );

drop policy if exists salles_update on public.salles;
create policy salles_update on public.salles
  for update to authenticated
  using (user_can_access_etab(etablissement_id)
         and current_user_role() = any(array['consultant','patron','resp_cuisine','hote']))
  with check (user_can_access_etab(etablissement_id)
              and current_user_role() = any(array['consultant','patron','resp_cuisine','hote']));

drop policy if exists salles_delete on public.salles;
create policy salles_delete on public.salles
  for delete to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and current_user_role() = any(array['consultant','patron','hote'])
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Realtime
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'salles'
  ) then
    alter publication supabase_realtime add table public.salles;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Commentaires
-- ─────────────────────────────────────────────────────────────────────────────
comment on table public.salles is
  'Espaces de service d''un établissement (salle principale, terrasse, véranda, carnotzet). Un plan de tables par salle, un onglet par salle dans le module Prévisions.';

comment on column public.salles.ordre is
  'Ordre d''affichage des onglets, choisi par la maison. Trié côté client : la salle principale passe avant la terrasse, ce que l''alphabet ne saurait pas faire.';

comment on column public.salle_tables.zone is
  'OBSOLÈTE depuis 20260817_plan_salle_espaces : remplacé par salle_id. Conservé le temps que plus aucun bundle déployé ne le lise.';

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (à exécuter manuellement si besoin) :
--
--   do $$
--   begin
--     if exists (select 1 from pg_publication_tables
--                where pubname = 'supabase_realtime' and tablename = 'salles') then
--       alter publication supabase_realtime drop table public.salles;
--     end if;
--   end $$;
--   alter table public.salle_tables drop column if exists salle_id;
--   drop table if exists public.salles;
-- ════════════════════════════════════════════════════════════════════════════
