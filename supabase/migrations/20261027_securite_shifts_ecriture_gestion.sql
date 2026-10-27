-- ============================================================================
-- Sécurité L0 : seuls ceux qui gèrent le planning écrivent dans shifts
--
-- Constat du 27.10.2026 (relevé L0, point 5) : shifts_insert, shifts_update et
-- shifts_delete ne demandaient que user_can_access_etab. Tout membre d'un
-- établissement (cuisinier, serveur, praticien spa) pouvait créer, modifier ou
-- effacer par l'API le planning et les pointages d'un collègue, alors que
-- l'écran réserve ces gestes à canWrite (Planning.jsx l. 116 :
-- perms.planning && canManageModule(role, 'planning')).
--
-- Garde posée : la même que l'écran, en base. user_peut_gerer('planning',
-- consultant, patron, resp_cuisine) lit, dans cet ordre, le droit
-- manage:planning de la personne (permissions_utilisateurs), puis celui du
-- rôle (permissions), puis les rôles par défaut ; c'est la règle de
-- canManageModule (droitsAction, moduleConfig.js l. 37), et celle déjà
-- appliquée à planning_groupe_membres.
--
-- Ce qui ne change pas : la lecture (shifts_select) ; le pointage, qui passe
-- par les RPC SECURITY DEFINER pointer_arrivee, pointer_depart,
-- pointer_hors_planning et pointer_offline, sans dépendre de ces policies.
--
-- Population au 27.10.2026 (personnes) : écriture possible en base 25 → 12
-- (consultant 3, patron 5, resp_cuisine 4) ; écriture offerte à l'écran 12 → 12.
-- Fermé pour cuisinier 6, serveur 6, praticien_spa 1, qui n'avaient aucun
-- bouton d'écriture. Aucun droit manage:planning posé par rôle ni par personne.
--
-- Idempotent, rejouable.
--
-- ROLLBACK : recréer les trois policies telles que relevées le 27.10.2026 :
--   create policy shifts_insert on public.shifts for insert to authenticated
--     with check (user_can_access_etab(etablissement_id));
--   create policy shifts_update on public.shifts for update to authenticated
--     using (user_can_access_etab(etablissement_id))
--     with check (user_can_access_etab(etablissement_id));
--   create policy shifts_delete on public.shifts for delete to authenticated
--     using (user_can_access_etab(etablissement_id));
-- ============================================================================

drop policy if exists shifts_insert on public.shifts;
create policy shifts_insert on public.shifts
  for insert to authenticated
  with check (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('planning', array['consultant', 'patron', 'resp_cuisine']))
  );

drop policy if exists shifts_update on public.shifts;
create policy shifts_update on public.shifts
  for update to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('planning', array['consultant', 'patron', 'resp_cuisine']))
  )
  with check (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('planning', array['consultant', 'patron', 'resp_cuisine']))
  );

drop policy if exists shifts_delete on public.shifts;
create policy shifts_delete on public.shifts
  for delete to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('planning', array['consultant', 'patron', 'resp_cuisine']))
  );
