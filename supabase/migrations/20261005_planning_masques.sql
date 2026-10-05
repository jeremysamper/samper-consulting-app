-- ============================================================================
-- Personnes masquées du Planning & Pointage
--
-- Le consultant et le patron retirent du planning et du pointage d'un
-- établissement les personnes qui n'y ont pas leur place (extra parti,
-- compte rattaché à plusieurs sites, chef qui ne pointe pas…). Une ligne =
-- une personne masquée dans un établissement ; la retirer la fait réapparaître.
--
-- Effet côté front (Planning.jsx) : la personne disparaît de la grille, de la
-- vue jour mobile, de la liste de pointage et des listes de choix d'équipier,
-- pour TOUS les rôles. Elle continue de voir ses propres horaires (pour pouvoir
-- pointer), et le relevé CCNT la garde (paie). Ses horaires ne sont ni
-- modifiés ni supprimés.
--
-- Ce n'est PAS une barrière de sécurité : la table shifts garde sa RLS.
-- La table ne règle que ce qui est affiché.
--
-- Pourquoi une table et pas une colonne de etablissements : etabs_write est
-- réservée au consultant, le patron n'aurait pas pu masquer.
--
-- Élargissement pur (expand) : table neuve, aucune donnée existante touchée.
-- Le front déployé avant elle ne la lit pas ; le front qui la lit reste
-- fonctionnel sans elle (statut 'absent', bouton caché, personne masquée).
--
-- APPLIQUÉ EN PROD via MCP le 05.10.2026, après le front (31f9a3b) : table vide,
-- 3 policies, RLS active, publication realtime, aucun droit anon. Advisor
-- sécurité sans alerte sur la table. Miroir repo == prod.
-- ============================================================================

create table if not exists public.planning_masques (
  etablissement_id text        not null references public.etablissements(id) on delete cascade,
  user_id          text        not null references public.profiles(id) on delete cascade,
  masque_par       text        default (auth.uid())::text,
  created_at       timestamptz not null default now(),
  primary key (etablissement_id, user_id)
);

alter table public.planning_masques enable row level security;
revoke all on public.planning_masques from anon;
grant select, insert, delete on public.planning_masques to authenticated;

-- Lecture : toute personne de l'établissement (le planning de chacun applique
-- le masquage).
drop policy if exists planning_masques_select on public.planning_masques;
create policy planning_masques_select on public.planning_masques
  for select to authenticated
  using (user_can_access_etab(etablissement_id));

-- Masquer : consultant et patron de l'établissement, et seulement une personne
-- rattachée à cet établissement.
drop policy if exists planning_masques_insert on public.planning_masques;
create policy planning_masques_insert on public.planning_masques
  for insert to authenticated
  with check (
    user_can_access_etab(etablissement_id)
    and (select current_user_role()) = any(array['consultant','patron'])
    and exists (
      select 1 from public.profiles p
      where p.id = planning_masques.user_id
        and planning_masques.etablissement_id = any(p.etablissement_ids)
    )
  );

-- Réafficher : mêmes rôles. Pas de policy UPDATE : une ligne ne se modifie pas.
drop policy if exists planning_masques_delete on public.planning_masques;
create policy planning_masques_delete on public.planning_masques
  for delete to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select current_user_role()) = any(array['consultant','patron'])
  );

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'planning_masques'
  ) then
    alter publication supabase_realtime add table public.planning_masques;
  end if;
end $$;

comment on table public.planning_masques is
  'Personnes masquées du Planning & Pointage d''un établissement (affichage seulement). Réglé par le consultant et le patron.';

-- Rollback :
--   alter publication supabase_realtime drop table public.planning_masques;
--   drop table if exists public.planning_masques;
