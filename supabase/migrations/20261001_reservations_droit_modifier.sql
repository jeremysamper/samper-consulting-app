-- ════════════════════════════════════════════════════════════════════════════
-- Réservations : le droit « Modifier » réglé dans Rôles & accès vaut en base
-- ───────────────────────────────────────────────────────────────────────────
-- Demande de Jérémy (01.10.2026) : pouvoir cocher « Modifier » pour le module
-- Réservations à n'importe quelle personne (une serveuse qui prend les
-- réservations au téléphone, par exemple).
--
-- Jusqu'ici l'écriture était réservée en dur aux rôles consultant, patron,
-- resp_cuisine et hote dans la RLS des cinq tables du module. Cocher
-- « Modifier » pour une serveuse aurait affiché les boutons, puis chaque
-- enregistrement aurait été refusé (42501). L'écran verrouillait donc la case.
--
-- Désormais la RLS demande à user_peut_gerer('previsions', <rôles par défaut>),
-- qui applique la même règle que le front (canManageModule) :
--   1. consultant : toujours ;
--   2. écart de la personne (permissions_utilisateurs, clé manage:previsions) ;
--   3. sinon réglage de son rôle (permissions, même clé) ;
--   4. sinon les rôles par défaut passés en argument.
-- Aujourd'hui aucune personne n'a d'écart et seul le rôle consultant porte
-- manage:previsions (true) : le résultat est IDENTIQUE à l'ancienne liste pour
-- tous les comptes existants.
--
-- Seule différence voulue : les suppressions de tags, de tables et de salles
-- excluaient resp_cuisine alors que l'écran les lui proposait (modifier les
-- allergies d'une réservation supprime puis recrée ses tags : ça échouait).
-- Elles suivent maintenant le même droit que la création.
--
-- Non touché : reservations_delete (suppression définitive, que l'app
-- n'utilise pas : une annulation passe le statut à 'annule'), les lectures,
-- les déclencheurs (SECURITY DEFINER, sans test de rôle).
--
-- Fonction en SECURITY INVOKER : elle ne lit que la ligne de l'appelant dans
-- permissions_utilisateurs (sa RLS l'y autorise) et permissions (lisible par
-- tous). Appelée dans un sous-select pour n'être évaluée qu'une fois par
-- requête. Idempotente. Rollback complet en fin de fichier.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.user_peut_gerer(p_module text, p_roles_defaut text[])
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $function$
  with moi as (
    select (select auth.uid())::text as uid, public.current_user_role() as role
  ),
  perso as (
    select pu.perms -> ('manage:' || p_module) as v
    from public.permissions_utilisateurs pu, moi
    where pu.user_id = moi.uid
  ),
  du_role as (
    select p.perms -> ('manage:' || p_module) as v
    from public.permissions p, moi
    where p.role_key = moi.role
  )
  select case
    when (select role from moi) = 'consultant' then true
    when coalesce((select role from moi), '') = '' then false
    when jsonb_typeof((select v from perso)) = 'boolean' then (select v from perso)::boolean
    when jsonb_typeof((select v from du_role)) = 'boolean' then (select v from du_role)::boolean
    else (select role from moi) = any (p_roles_defaut)
  end;
$function$;

comment on function public.user_peut_gerer(text, text[]) is
  'Droit « gérer » (Modifier) de l''appelant sur un module : consultant, puis écart personnel (permissions_utilisateurs), puis réglage du rôle (permissions), puis rôles par défaut. Même règle que canManageModule côté front.';

revoke execute on function public.user_peut_gerer(text, text[]) from public, anon;
grant execute on function public.user_peut_gerer(text, text[]) to authenticated, service_role;

-- ── reservations ────────────────────────────────────────────────────────────
drop policy if exists reservations_insert on public.reservations;
create policy reservations_insert on public.reservations
  for insert
  with check (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('previsions', array['consultant', 'patron', 'resp_cuisine', 'hote']))
  );

drop policy if exists reservations_update on public.reservations;
create policy reservations_update on public.reservations
  for update
  using (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('previsions', array['consultant', 'patron', 'resp_cuisine', 'hote']))
  )
  with check (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('previsions', array['consultant', 'patron', 'resp_cuisine', 'hote']))
  );

-- ── reservation_tags ────────────────────────────────────────────────────────
drop policy if exists reservation_tags_insert on public.reservation_tags;
create policy reservation_tags_insert on public.reservation_tags
  for insert
  with check (
    exists (
      select 1 from public.reservations r
      where r.id = reservation_tags.reservation_id
        and user_can_access_etab(r.etablissement_id)
    )
    and (select public.user_peut_gerer('previsions', array['consultant', 'patron', 'resp_cuisine', 'hote']))
  );

drop policy if exists reservation_tags_delete on public.reservation_tags;
create policy reservation_tags_delete on public.reservation_tags
  for delete
  using (
    exists (
      select 1 from public.reservations r
      where r.id = reservation_tags.reservation_id
        and user_can_access_etab(r.etablissement_id)
    )
    and (select public.user_peut_gerer('previsions', array['consultant', 'patron', 'resp_cuisine', 'hote']))
  );

-- ── reservation_tables (placement sur le plan) ──────────────────────────────
drop policy if exists reservation_tables_insert on public.reservation_tables;
create policy reservation_tables_insert on public.reservation_tables
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.reservations r
      where r.id = reservation_tables.reservation_id
        and user_can_access_etab(r.etablissement_id)
    )
    and exists (
      select 1 from public.salle_tables st
      join public.reservations r on r.id = reservation_tables.reservation_id
      where st.id = reservation_tables.table_id
        and st.etablissement_id = r.etablissement_id
    )
    and (select public.user_peut_gerer('previsions', array['consultant', 'patron', 'resp_cuisine', 'hote']))
  );

drop policy if exists reservation_tables_delete on public.reservation_tables;
create policy reservation_tables_delete on public.reservation_tables
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.reservations r
      where r.id = reservation_tables.reservation_id
        and user_can_access_etab(r.etablissement_id)
    )
    and (select public.user_peut_gerer('previsions', array['consultant', 'patron', 'resp_cuisine', 'hote']))
  );

-- ── salles et salle_tables (dessin du plan) ─────────────────────────────────
drop policy if exists salles_insert on public.salles;
create policy salles_insert on public.salles
  for insert
  to authenticated
  with check (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('previsions', array['consultant', 'patron', 'resp_cuisine', 'hote']))
  );

drop policy if exists salles_update on public.salles;
create policy salles_update on public.salles
  for update
  to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('previsions', array['consultant', 'patron', 'resp_cuisine', 'hote']))
  )
  with check (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('previsions', array['consultant', 'patron', 'resp_cuisine', 'hote']))
  );

drop policy if exists salles_delete on public.salles;
create policy salles_delete on public.salles
  for delete
  to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('previsions', array['consultant', 'patron', 'resp_cuisine', 'hote']))
  );

drop policy if exists salle_tables_insert on public.salle_tables;
create policy salle_tables_insert on public.salle_tables
  for insert
  to authenticated
  with check (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('previsions', array['consultant', 'patron', 'resp_cuisine', 'hote']))
  );

drop policy if exists salle_tables_update on public.salle_tables;
create policy salle_tables_update on public.salle_tables
  for update
  to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('previsions', array['consultant', 'patron', 'resp_cuisine', 'hote']))
  )
  with check (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('previsions', array['consultant', 'patron', 'resp_cuisine', 'hote']))
  );

drop policy if exists salle_tables_delete on public.salle_tables;
create policy salle_tables_delete on public.salle_tables
  for delete
  to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('previsions', array['consultant', 'patron', 'resp_cuisine', 'hote']))
  );

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK : remet les listes de rôles en dur (état du 30.09.2026).
--
-- drop policy if exists reservations_insert on public.reservations;
-- create policy reservations_insert on public.reservations for insert
--   with check (user_can_access_etab(etablissement_id) and current_user_role() = any (array['consultant','patron','resp_cuisine','hote']));
-- drop policy if exists reservations_update on public.reservations;
-- create policy reservations_update on public.reservations for update
--   using (user_can_access_etab(etablissement_id) and current_user_role() = any (array['consultant','patron','resp_cuisine','hote']))
--   with check (user_can_access_etab(etablissement_id) and current_user_role() = any (array['consultant','patron','resp_cuisine','hote']));
-- drop policy if exists reservation_tags_insert on public.reservation_tags;
-- create policy reservation_tags_insert on public.reservation_tags for insert
--   with check (exists (select 1 from reservations r where r.id = reservation_tags.reservation_id and user_can_access_etab(r.etablissement_id) and current_user_role() = any (array['consultant','patron','resp_cuisine','hote'])));
-- drop policy if exists reservation_tags_delete on public.reservation_tags;
-- create policy reservation_tags_delete on public.reservation_tags for delete
--   using (exists (select 1 from reservations r where r.id = reservation_tags.reservation_id and user_can_access_etab(r.etablissement_id) and current_user_role() = any (array['consultant','patron','hote'])));
-- drop policy if exists reservation_tables_insert on public.reservation_tables;
-- create policy reservation_tables_insert on public.reservation_tables for insert to authenticated
--   with check ((exists (select 1 from reservations r where r.id = reservation_tables.reservation_id and user_can_access_etab(r.etablissement_id) and current_user_role() = any (array['consultant','patron','resp_cuisine','hote'])))
--     and (exists (select 1 from salle_tables st join reservations r on r.id = reservation_tables.reservation_id where st.id = reservation_tables.table_id and st.etablissement_id = r.etablissement_id)));
-- drop policy if exists reservation_tables_delete on public.reservation_tables;
-- create policy reservation_tables_delete on public.reservation_tables for delete to authenticated
--   using (exists (select 1 from reservations r where r.id = reservation_tables.reservation_id and user_can_access_etab(r.etablissement_id) and current_user_role() = any (array['consultant','patron','resp_cuisine','hote'])));
-- drop policy if exists salles_insert on public.salles;
-- create policy salles_insert on public.salles for insert to authenticated
--   with check (user_can_access_etab(etablissement_id) and current_user_role() = any (array['consultant','patron','resp_cuisine','hote']));
-- drop policy if exists salles_update on public.salles;
-- create policy salles_update on public.salles for update to authenticated
--   using (user_can_access_etab(etablissement_id) and current_user_role() = any (array['consultant','patron','resp_cuisine','hote']))
--   with check (user_can_access_etab(etablissement_id) and current_user_role() = any (array['consultant','patron','resp_cuisine','hote']));
-- drop policy if exists salles_delete on public.salles;
-- create policy salles_delete on public.salles for delete to authenticated
--   using (user_can_access_etab(etablissement_id) and current_user_role() = any (array['consultant','patron','hote']));
-- drop policy if exists salle_tables_insert on public.salle_tables;
-- create policy salle_tables_insert on public.salle_tables for insert to authenticated
--   with check (user_can_access_etab(etablissement_id) and current_user_role() = any (array['consultant','patron','resp_cuisine','hote']));
-- drop policy if exists salle_tables_update on public.salle_tables;
-- create policy salle_tables_update on public.salle_tables for update to authenticated
--   using (user_can_access_etab(etablissement_id) and current_user_role() = any (array['consultant','patron','resp_cuisine','hote']))
--   with check (user_can_access_etab(etablissement_id) and current_user_role() = any (array['consultant','patron','resp_cuisine','hote']));
-- drop policy if exists salle_tables_delete on public.salle_tables;
-- create policy salle_tables_delete on public.salle_tables for delete to authenticated
--   using (user_can_access_etab(etablissement_id) and current_user_role() = any (array['consultant','patron','hote']));
-- drop function if exists public.user_peut_gerer(text, text[]);
-- Le front reste compatible : il verrouille alors de nouveau « Modifier »
-- seulement si rolesEcritureBase.previsions est remis (moduleConfig.js).
-- ════════════════════════════════════════════════════════════════════════════
