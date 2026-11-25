-- ============================================================================
-- Inverse de 20261125_carte_boissons_suppression_carte.sql : rend à
-- cartes_boissons_delete sa forme du lot C (droit boissons, ou « Modifier »
-- recettes, carte vide ou non). Idempotent.
-- ============================================================================

set local lock_timeout = '5s';

drop policy if exists cartes_boissons_delete on public.cartes;
create policy cartes_boissons_delete on public.cartes
  as restrictive
  for delete to authenticated
  using (
    genre <> 'boissons'
    or (select public.boissons_peut_modifier())
    or (select public.user_peut_gerer('recettes', array['consultant', 'patron', 'resp_cuisine']))
  );
