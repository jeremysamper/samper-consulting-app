-- ============================================================================
-- HARDENING STORAGE (M5-config / brief 3) - 2026-07-12
--
-- Le bucket haccp-photos n'avait aucun allowed_mime_types ni file_size_limit
-- (contraste avec recette-photos : image + 5 Mo, et documents : PDF + 50 Mo).
-- On aligne les garde-fous au niveau bucket (defense en profondeur), en plus
-- de la validation deja faite par l'edge function upload-haccp-photo.
--
-- Le passage public -> prive (URLs signees) est REPORTE : il exige une refonte
-- cote client (URLs publiques permanentes stockees, getPublicUrl dans l'EF).
-- Suivi comme item dedie.
--
-- Idempotent : UPDATE cible par id, rejouable sans effet de bord.
--
-- ROLLBACK :
--   update storage.buckets
--   set allowed_mime_types = null, file_size_limit = null
--   where id = 'haccp-photos';
-- ============================================================================

update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
    file_size_limit    = 8388608          -- 8 Mo, aligne sur la validation de l'edge function
where id = 'haccp-photos';
