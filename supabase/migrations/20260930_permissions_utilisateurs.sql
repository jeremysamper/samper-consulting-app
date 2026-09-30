-- ════════════════════════════════════════════════════════════════════════════
-- Droits d'accès réglés personne par personne
-- ───────────────────────────────────────────────────────────────────────────
-- Jusqu'ici les accès aux modules (voir / gérer) se réglaient par rôle, dans la
-- table `permissions` (une ligne par rôle). Demande de Jérémy (30.09.2026) :
-- les régler individuellement, dans un seul écran.
--
-- Le rôle reste le point de départ : `permissions` n'est pas touchée et
-- continue de fixer les droits d'un nouveau compte. Cette table ne porte que
-- les ÉCARTS d'une personne à son rôle, avec les mêmes clés :
--   { "previsions": true, "manage:previsions": false, "pos": false, … }
-- Clé absente = droit du rôle. Aucune ligne = la personne a exactement les
-- droits de son rôle.
--
-- Ces droits pilotent l'interface (menu, boutons). Ils n'ouvrent rien en base :
-- la RLS de chaque module reste fondée sur l'établissement et le rôle. Un
-- droit « gérer » accordé à une personne dont le rôle n'écrit pas dans un
-- module protégé (réservations, groupes, mise en place, POS) est donc refusé
-- par l'écran des droits lui-même, qui connaît ces rôles.
--
-- QUI LIT, QUI ÉCRIT
--   lecture  : sa propre ligne (le front l'applique au démarrage), et le
--              consultant pour toutes (écran Rôles & accès).
--   écriture : consultant seulement, comme `permissions`.
--
-- Migration additive (expand) : une table isolée, aucune colonne ni politique
-- existante touchée. Un bundle antérieur l'ignore ; un bundle postérieur
-- déployé avant elle retombe sur les droits du rôle (lecture en échec =
-- aucun écart). Idempotente, rejouable sans erreur. Rollback en fin de fichier.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.permissions_utilisateurs (
  user_id    text        primary key references public.profiles(id) on delete cascade,
  perms      jsonb       not null default '{}'::jsonb
                         check (jsonb_typeof(perms) = 'object'),
  updated_at timestamptz not null default now()
);

comment on table public.permissions_utilisateurs is
  'Écarts de droits d''une personne par rapport à son rôle (mêmes clés que permissions.perms : <module> et manage:<module>). Clé absente = droit du rôle.';

alter table public.permissions_utilisateurs enable row level security;

-- Personne n'y accède sans session.
revoke all on table public.permissions_utilisateurs from anon;

drop policy if exists permissions_utilisateurs_read on public.permissions_utilisateurs;
create policy permissions_utilisateurs_read
  on public.permissions_utilisateurs
  for select
  to authenticated
  using (
    user_id = (select auth.uid())::text
    or (select public.current_user_role()) = 'consultant'
  );

drop policy if exists permissions_utilisateurs_write on public.permissions_utilisateurs;
create policy permissions_utilisateurs_write
  on public.permissions_utilisateurs
  for all
  to authenticated
  using ((select public.current_user_role()) = 'consultant')
  with check ((select public.current_user_role()) = 'consultant');

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (à exécuter à la main si besoin) :
--   drop table if exists public.permissions_utilisateurs;
-- Le front déployé retombe alors sur les droits du rôle, sans erreur.
-- ════════════════════════════════════════════════════════════════════════════
