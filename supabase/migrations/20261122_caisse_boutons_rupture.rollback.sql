-- Inverse de 20261122_caisse_boutons_rupture.sql.
-- À jouer seulement après le retour du front d'avant (Instant Rollback sur
-- Vercel) : le front du lot L2 lit et écrit rupture_le. Les ruptures du jour
-- sont perdues, les produits redeviennent tous vendables.

alter table public.caisse_boutons drop column if exists rupture_le;
