-- Inverse de 20261115_points_cadeaux_photo : retire la contrainte et la colonne
-- photo_url de points_cadeaux. Seulement après le retour d'un front qui ne la
-- lit plus. Les fichiers du stockage restent (99-rollback des données ne les
-- efface pas non plus).

set local lock_timeout = '3s';

alter table public.points_cadeaux drop constraint if exists points_cadeaux_photo_url_check;
alter table public.points_cadeaux drop column if exists photo_url;
