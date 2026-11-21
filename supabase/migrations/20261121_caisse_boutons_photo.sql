-- ════════════════════════════════════════════════════════════════════════════
-- Caisse : une photo sur chaque case de la grille (21.11.2026).
--
-- caisse_boutons.photo_url :
--   null : la case montre la photo de la fiche du plat (plats.photo_url), s'il
--          y en a une ;
--   ''   : la maison a choisi « Sans photo » ;
--   url  : photo posée dans la caisse, envoyée par l'Edge Function
--          upload-recette-photo (bucket public recette-photos, type 'caisse').
-- La contrainte n'accepte que ce bucket : aucune adresse d'image venue d'un
-- autre site ne s'affiche sur les postes de la caisse.
--
-- Expand seul : colonne nullable, sans défaut. Le front en ligne n'en sait
-- rien et n'écrit que nom_court, couleur et picto (l'upsert ne nomme que ses
-- colonnes) : la photo posée par le nouveau front n'est jamais effacée par
-- l'ancien. RLS inchangée (écriture consultant, patron, resp_cuisine).
--
-- Rollback :
--   alter table public.caisse_boutons drop constraint if exists caisse_boutons_photo_url_check;
--   alter table public.caisse_boutons drop column if exists photo_url;
-- ════════════════════════════════════════════════════════════════════════════

alter table public.caisse_boutons add column if not exists photo_url text;

alter table public.caisse_boutons drop constraint if exists caisse_boutons_photo_url_check;
alter table public.caisse_boutons add constraint caisse_boutons_photo_url_check
  check (
    photo_url is null
    or photo_url = ''
    or (
      char_length(photo_url) <= 600
      and photo_url ~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/recette-photos/'
    )
  );
