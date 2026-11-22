-- -----------------------------------------------------------------------------
-- Lot 2a, décision D5 : fils d'équipe dans Messages (22.11.2026)
--
-- Les fils Cuisine, Salle et Toute l'équipe vivent dans canaux_messages
-- (lot H6), sans colonne neuve ni canal neuf :
--   Cuisine         canal 'cuisine'
--   Salle           canal 'restaurant' (le pôle Restaurant de l'Hôtel ; le
--                   front l'appelle « Salle » dans Messages)
--   Toute l'équipe  canal 'tous'
--
-- Seuls les participants lisent. Jusqu'ici, toute l'équipe de l'établissement
-- lisait et écrivait tous les canaux, celui de la direction compris. Les
-- participants d'un canal sont désormais fixés par rôle
-- (canal_participant) ; consultant et patron participent à tous. On lit aussi
-- un message dont on est l'auteur ou où l'on est mentionné. On n'écrit que
-- dans un canal où l'on participe.
--
-- Effet sur l'existant : canaux_messages n'a aucune ligne en production au
-- 22.11.2026 ; l'écran Canaux de Passations (Hôtel) montre tous les onglets,
-- ceux d'un canal où l'on ne participe pas restent vides et refusent l'envoi.
-- Correction : auteur ou case Modifier de Passations, comme avant, et le
-- message ne change pas de canal vers un canal où l'on ne participe pas.
-- Suppression : policy inchangée (auteur, ou case Modifier de Passations).
--
-- Idempotente. Retour arrière : 20261122_lot2a_d5_canaux_equipe.rollback.sql.
-- -----------------------------------------------------------------------------

set local lock_timeout = '3s';

-- Les policies de canaux_messages sont versionnées dans
-- 20261028_hotel_h6.sql (canaux_messages_select, _insert, _update, _delete).
-- Une policy d'un autre nom s'ajouterait en OU et rouvrirait la lecture : la
-- migration s'arrête plutôt que de la laisser.
do $$
declare
  v_inconnues text;
begin
  select string_agg(policyname, ', ') into v_inconnues
  from pg_policies
  where schemaname = 'public' and tablename = 'canaux_messages'
    and policyname not in ('canaux_messages_select', 'canaux_messages_insert',
                           'canaux_messages_update', 'canaux_messages_delete');
  if v_inconnues is not null then
    raise exception 'Policies inattendues sur canaux_messages : %', v_inconnues;
  end if;
end $$;

-- Participants d'un canal, par rôle. Les rôles de chaque pôle sont ceux de
-- poleDuRole (src/modules/hebergement/hotelData.js), plus l'hôte en salle ;
-- la direction (consultant, patron) participe à tous. Le front qui affiche
-- les fils lit la même table de correspondance : la tenir en phase.
create or replace function public.canal_participant(p_canal text, p_role text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $fn$
  select coalesce(case p_canal
    when 'tous'       then p_role <> ''
    when 'direction'  then p_role in ('consultant', 'patron')
    when 'cuisine'    then p_role in ('consultant', 'patron', 'resp_cuisine', 'cuisinier')
    when 'restaurant' then p_role in ('consultant', 'patron', 'serveur', 'hote')
    when 'reception'  then p_role in ('consultant', 'patron', 'receptionniste', 'hote')
    when 'etages'     then p_role in ('consultant', 'patron', 'gouvernante', 'femme_de_chambre')
    when 'technique'  then p_role in ('consultant', 'patron', 'technicien')
    when 'spa'        then p_role in ('consultant', 'patron', 'praticien_spa')
    else false
  end, false);
$fn$;

revoke all on function public.canal_participant(text, text) from public, anon, authenticated;
grant execute on function public.canal_participant(text, text) to authenticated, service_role;

drop policy if exists canaux_messages_select on public.canaux_messages;
create policy canaux_messages_select on public.canaux_messages
  for select to authenticated
  using (user_can_access_etab(etablissement_id)
    and (public.canal_participant(canal, (select public.current_user_role()))
      or created_by = (select auth.uid())::text
      or mentions @> array[(select auth.uid())::text]));

drop policy if exists canaux_messages_insert on public.canaux_messages;
create policy canaux_messages_insert on public.canaux_messages
  for insert to authenticated
  with check (user_can_access_etab(etablissement_id)
    and public.canal_participant(canal, (select public.current_user_role())));

-- Une correction ne fait pas passer un message dans un canal où l'on ne
-- participe pas (même using qu'au lot H6, canal vérifié en with check).
drop policy if exists canaux_messages_update on public.canaux_messages;
create policy canaux_messages_update on public.canaux_messages
  for update to authenticated
  using (user_can_access_etab(etablissement_id)
    and (created_by = (select auth.uid())::text
      or (select public.user_peut_gerer('passations', array['consultant', 'patron', 'receptionniste', 'gouvernante', 'resp_cuisine']))))
  with check (user_can_access_etab(etablissement_id)
    and public.canal_participant(canal, (select public.current_user_role()))
    and (created_by = (select auth.uid())::text
      or (select public.user_peut_gerer('passations', array['consultant', 'patron', 'receptionniste', 'gouvernante', 'resp_cuisine']))));

comment on function public.canal_participant(text, text) is
  'Participants d''un canal de canaux_messages, par rôle (lot 2a, D5). Fils d''équipe : cuisine, restaurant (Salle), tous.';
