-- Retour arrière de 20261122_lot2a_d5_canaux_equipe.sql : toute l'équipe de
-- l'établissement relit et écrit tous les canaux, comme au lot H6
-- (20261028_hotel_h6.sql). Aucune donnée touchée. A jouer après le retour du
-- front à une version qui ne lit pas canal_participant.

drop policy if exists canaux_messages_select on public.canaux_messages;
create policy canaux_messages_select on public.canaux_messages
  for select to authenticated
  using (user_can_access_etab(etablissement_id));

drop policy if exists canaux_messages_insert on public.canaux_messages;
create policy canaux_messages_insert on public.canaux_messages
  for insert to authenticated
  with check (user_can_access_etab(etablissement_id));

drop policy if exists canaux_messages_update on public.canaux_messages;
create policy canaux_messages_update on public.canaux_messages
  for update to authenticated
  using (user_can_access_etab(etablissement_id)
    and (created_by = (select auth.uid())::text
      or (select public.user_peut_gerer('passations', array['consultant', 'patron', 'receptionniste', 'gouvernante', 'resp_cuisine']))))
  with check (user_can_access_etab(etablissement_id)
    and (created_by = (select auth.uid())::text
      or (select public.user_peut_gerer('passations', array['consultant', 'patron', 'receptionniste', 'gouvernante', 'resp_cuisine']))));

drop function if exists public.canal_participant(text, text);
