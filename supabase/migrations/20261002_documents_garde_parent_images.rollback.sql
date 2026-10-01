-- Rollback de 20261002_documents_garde_parent_images.sql
-- À n'exécuter qu'après avoir redéployé un front qui n'importe plus d'images :
-- les images déjà déposées restent lisibles (la restriction ne vaut qu'à l'envoi).

drop trigger if exists documents_verifier_parent on public.documents;
drop function if exists public.documents_verifier_parent();

update storage.buckets
set allowed_mime_types = array['application/pdf']
where id = 'documents';

-- Réparation de données du 02.10.2026 (hors migration, pour mémoire) :
-- les deux dossiers du Panorama étaient rangés dans « 2026 » de Woodland.
-- Inverse exact, à ne pas rejouer sauf raison impérieuse :
-- update documents set parent_id = 'dir-1777140327260924'
-- where id in ('dir-1777320404512737','dir-1777320409085357');
