-- ============================================================================
-- Migration 6 (DOWN) : rollback du bucket photos plats/recettes
-- ============================================================================

drop policy if exists "recette_photos_insert" on storage.objects;
drop policy if exists "recette_photos_update" on storage.objects;
drop policy if exists "recette_photos_delete" on storage.objects;
drop policy if exists "recette_photos_select" on storage.objects;

-- Supprime les objets du bucket avant de supprimer le bucket.
delete from storage.objects where bucket_id = 'recette-photos';
delete from storage.buckets where id = 'recette-photos';
