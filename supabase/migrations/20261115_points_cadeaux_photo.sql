-- ════════════════════════════════════════════════════════════════════════════
-- Points : une photo par cadeau de la boutique (15.11.2026).
-- Colonne points_cadeaux.photo_url : adresse publique d'une image du stockage
-- Supabase de l'app (bucket recette-photos, envoi par l'Edge Function
-- upload-recette-photo), seule source que la CSP laisse afficher. Écrite par
-- qui gère les points, comme le reste du catalogue (policies inchangées).
-- Ajout seul : le front déployé l'ignore. Rejouable.
-- Inverse : supabase/migrations-inverse/20261115_points_cadeaux_photo.sql
-- Photos du catalogue : supabase/migrations/data-20261115-points-cadeaux-photos/
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';

alter table public.points_cadeaux add column if not exists photo_url text;

do $do$
begin
  if not exists (select 1 from pg_constraint
                 where conname = 'points_cadeaux_photo_url_check'
                   and conrelid = 'public.points_cadeaux'::regclass) then
    alter table public.points_cadeaux add constraint points_cadeaux_photo_url_check
      check (photo_url is null
             or (length(photo_url) <= 1000
                 and photo_url ~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/'));
  end if;
end;
$do$;

comment on column public.points_cadeaux.photo_url is
  'Photo du cadeau : adresse publique du stockage Supabase de l''app (aucune autre source, CSP img-src). Null : picto.';
