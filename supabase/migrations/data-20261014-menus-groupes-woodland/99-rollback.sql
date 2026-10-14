-- Retire les menus importés le 14.10.2026. Un menu modifié depuis dans l'app
-- garde son id `woodland-*` (l'enregistrement est un upsert) : relire
-- 02-verification.sql avant, ce retour arrière effacerait aussi ces retouches.
begin;
delete from public.groupe_menus
where etablissement_id = 'etab-2' and id like 'woodland-%';
commit;
