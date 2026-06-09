-- ============================================================================
-- Migration 6 (UP) : bucket public pour les photos de plats et recettes
--
-- Probleme corrige : l'upload de photo (Outils consultant -> plats / recettes)
-- ne fonctionnait pas car :
--   1. le bucket 'documents' n'autorise que application/pdf (images rejetees) ;
--   2. la RLS storage verifie split_part(name,'/',1) = etab, or le code ecrivait
--      sous 'recettes-photos/<etab>/...' (1er segment = 'recettes-photos').
--
-- Solution : bucket DEDIE, PUBLIC (URL permanente, ne casse pas), images only,
-- path = <etabId>/<fichier> (1er segment = etab => RLS OK).
-- 0 donnee a migrer (aucune photo n'avait pu etre enregistree).
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recette-photos', 'recette-photos', true, 5242880,
        array['image/jpeg','image/jpg','image/png','image/webp'])
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "recette_photos_insert" on storage.objects;
drop policy if exists "recette_photos_update" on storage.objects;
drop policy if exists "recette_photos_delete" on storage.objects;
drop policy if exists "recette_photos_select" on storage.objects;

-- Ecriture : utilisateurs authentifies ayant acces a l'etab (1er segment du path).
create policy "recette_photos_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'recette-photos' and user_can_access_etab(split_part(name, '/', 1)));

create policy "recette_photos_update" on storage.objects
  for update to authenticated
  using      (bucket_id = 'recette-photos' and user_can_access_etab(split_part(name, '/', 1)))
  with check (bucket_id = 'recette-photos' and user_can_access_etab(split_part(name, '/', 1)));

create policy "recette_photos_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'recette-photos' and user_can_access_etab(split_part(name, '/', 1)));

-- Lecture : AUCUNE policy SELECT. Un bucket public sert deja les objets via
-- l'URL publique (/object/public/...) sans RLS. Une policy SELECT large
-- permettrait en plus de LISTER tous les fichiers (enumeration) -> on l'evite.
