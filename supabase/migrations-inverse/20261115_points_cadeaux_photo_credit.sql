-- Inverse de 20261115_points_cadeaux_photo_credit : retire les contraintes et
-- les colonnes photo_credit et photo_source. Seulement après le retour d'un
-- front qui ne les écrit plus.

set local lock_timeout = '3s';

alter table public.points_cadeaux drop constraint if exists points_cadeaux_photo_credit_check;
alter table public.points_cadeaux drop constraint if exists points_cadeaux_photo_source_check;
alter table public.points_cadeaux drop column if exists photo_credit;
alter table public.points_cadeaux drop column if exists photo_source;
