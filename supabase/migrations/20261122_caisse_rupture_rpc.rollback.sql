-- Inverse de 20261122_caisse_rupture_rpc.sql.
-- À jouer seulement après le retour d'un front qui écrit la rupture par
-- l'upsert (Instant Rollback sur Vercel) : le front de cette suite appelle la
-- fonction. Les serveurs perdent alors le geste, les rôles de l'habillage le
-- gardent par l'upsert. La colonne rupture_le reste (son inverse est
-- 20261122_caisse_boutons_rupture.rollback.sql).

drop function if exists public.caisse_poser_rupture(text, text, boolean);
