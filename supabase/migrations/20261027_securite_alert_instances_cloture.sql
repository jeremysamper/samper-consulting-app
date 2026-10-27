-- ============================================================================
-- Sécurité L0 : un destinataire d'alerte peut la clore, pas la réécrire
--
-- Constat du 27.10.2026 (relevé L0, point 6) : alert_instances_dismiss était
-- un UPDATE sans WITH CHECK et authenticated avait UPDATE sur les 15 colonnes.
-- Un destinataire pouvait changer le titre, le message, la gravité ou les
-- destinataires d'une alerte partagée de son établissement, par exemple la
-- retirer au patron.
--
-- Le front n'écrit que trois colonnes (src/hooks/useAlertInstances.js,
-- dismiss l. 155 et dismissAll l. 181) : status = 'dismissed', dismissed_at,
-- dismissed_by = l'appelant. Les autres écritures viennent de alerts-evaluator
-- en service_role, que ni les droits de colonne ni la RLS ne touchent.
--
-- Changements :
--   1. UPDATE de authenticated limité à status, dismissed_at, dismissed_by.
--   2. La policy ne vise plus que les alertes encore actives (une alerte
--      résolue ou déjà close par un collègue n'est plus réécrite) et exige,
--      sur la ligne écrite, une clôture par l'appelant lui-même. Le front ne
--      clôt que des alertes actives : dismissAll ignore simplement celles qui
--      viennent d'être résolues.
--
-- Population : inchangée (les destinataires de l'alerte). Seules les colonnes
-- et la valeur écrite sont bornées.
--
-- Idempotent, rejouable.
--
-- ROLLBACK :
--   grant update on public.alert_instances to authenticated;
--   drop policy if exists alert_instances_dismiss on public.alert_instances;
--   create policy alert_instances_dismiss on public.alert_instances
--     for update to public
--     using (user_can_access_etab(etablissement_id)
--            and ((current_user_role() = any (target_roles))
--                 or ((select auth.uid())::text = any (target_user_ids))));
-- ============================================================================

revoke update on public.alert_instances from authenticated;
grant update (status, dismissed_at, dismissed_by) on public.alert_instances to authenticated;

drop policy if exists alert_instances_dismiss on public.alert_instances;
create policy alert_instances_dismiss on public.alert_instances
  for update to authenticated
  using (
    status = 'active'
    and user_can_access_etab(etablissement_id)
    and (
      (select public.current_user_role()) = any (target_roles)
      or (select auth.uid())::text = any (target_user_ids)
    )
  )
  with check (
    user_can_access_etab(etablissement_id)
    and (
      (select public.current_user_role()) = any (target_roles)
      or (select auth.uid())::text = any (target_user_ids)
    )
    and status = 'dismissed'
    and dismissed_by = (select auth.uid())::text
  );
