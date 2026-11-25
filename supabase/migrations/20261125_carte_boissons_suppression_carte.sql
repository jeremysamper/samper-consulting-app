-- ============================================================================
-- Carte des boissons, lot C2 : supprimer une carte de boissons non vide
-- (25.11.2026).
--
-- Revue de sécurité du lot C (20261123_carte_boissons_droits.sql) : supprimer
-- une carte de boissons ne demandait que « Modifier » recettes, et la
-- suppression efface ses liens carte_plats en cascade (ON DELETE CASCADE),
-- sans repasser par leur policy (droit boissons, ou recettes ET fiches). Les
-- plats sans format de la carte cessaient alors d'être des boissons, et leur
-- prix redevenait modifiable par ce détenteur.
--
-- Désormais, « Modifier » recettes seul ne supprime qu'une carte de boissons
-- vide. Une carte qui porte encore des liens demande le droit boissons, ou
-- recettes ET fiches, comme ses liens. Le reste du lot C ne change pas.
-- Le front du lot C dit le refus (deleteCarte relit les lignes supprimées) ;
-- le front en ligne ne supprime alors rien, sans message.
--
-- Expand seul, idempotente, inerte au rejeu.
-- Inverse : 20261125_carte_boissons_suppression_carte.rollback.sql
-- ============================================================================

set local lock_timeout = '5s';

drop policy if exists cartes_boissons_delete on public.cartes;
create policy cartes_boissons_delete on public.cartes
  as restrictive
  for delete to authenticated
  using (
    genre <> 'boissons'
    or (select public.boissons_peut_modifier())
    or ((select public.user_peut_gerer('recettes', array['consultant', 'patron', 'resp_cuisine']))
        and ((select public.user_peut_gerer('fiches', array['consultant', 'patron']))
             or not exists (select 1 from public.carte_plats cp where cp.carte_id = cartes.id)))
  );
