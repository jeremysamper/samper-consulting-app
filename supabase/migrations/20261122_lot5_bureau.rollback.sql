-- -----------------------------------------------------------------------------
-- Retour arrière de 20261122_lot5_bureau.sql (lot 5 du plan 15).
--
-- Les policies reprennent leur texte d'avant (établissement seul, lu en
-- production le 22.11.2026), puis les fonctions, déclencheurs, contraintes et
-- colonnes du lot partent. Les lignes 'journal' et 'statistiques' de
-- reglages_modules sont supprimées : la contrainte du lot 6b les refuserait.
-- Les réglages d'exercice, de cartes et de dossiers réservés sont perdus.
-- Revenir d'abord sur le front (Instant Rollback), puis jouer ce fichier. Le
-- droit de mise à jour des colonnes du lot 2a sur compta_reglages reste.
-- -----------------------------------------------------------------------------

set local lock_timeout = '3s';

-- C. documents et stockage : policies d'avant
drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents
  for select to authenticated using (user_can_access_etab(etablissement_id));
drop policy if exists documents_insert on public.documents;
create policy documents_insert on public.documents
  for insert to authenticated with check (user_can_access_etab(etablissement_id));
drop policy if exists documents_update on public.documents;
create policy documents_update on public.documents
  for update to authenticated
  using (user_can_access_etab(etablissement_id)) with check (user_can_access_etab(etablissement_id));
drop policy if exists documents_delete on public.documents;
create policy documents_delete on public.documents
  for delete to authenticated using (user_can_access_etab(etablissement_id));

drop policy if exists documents_storage_select on storage.objects;
create policy documents_storage_select on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and user_can_access_etab(split_part(name, '/', 1)));
drop policy if exists documents_storage_update on storage.objects;
create policy documents_storage_update on storage.objects
  for update to authenticated
  using (bucket_id = 'documents' and user_can_access_etab(split_part(name, '/', 1)));
drop policy if exists documents_storage_delete on storage.objects;
create policy documents_storage_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents' and user_can_access_etab(split_part(name, '/', 1)));

drop trigger if exists trg_documents_garde_suppression on public.documents;
drop function if exists public.documents_garde_suppression();
drop trigger if exists trg_documents_garde_visibilite on public.documents;
drop function if exists public.documents_garde_visibilite();
drop function if exists public.document_objet_visible(text);
drop function if exists public.document_visible(text);
drop index if exists public.documents_storage_path_idx;
alter table public.documents drop constraint if exists documents_roles_visibles_check;
alter table public.documents drop column if exists roles_visibles;

-- B. compta_reglages
alter table public.compta_reglages drop constraint if exists compta_reglages_cartes_check;
drop function if exists public.compta_cartes_distinctes(text[]);
alter table public.compta_reglages drop constraint if exists compta_reglages_exercice_check;
alter table public.compta_reglages drop column if exists cartes_accueil;
alter table public.compta_reglages drop column if exists exercice_debut_mois;

-- A. reglages_modules : contraintes du lot 6b
drop trigger if exists trg_reglages_modules_journal_garde on public.reglages_modules;
drop function if exists public.reglages_modules_journal_garde();
delete from public.reglages_modules where module in ('journal', 'statistiques');
alter table public.reglages_modules
  drop constraint if exists reglages_modules_config_check,
  add constraint reglages_modules_config_check
    check (public.reglages_modules_config_valide(module, config) or public.reglages_modules_hotel_valide(module, config)),
  drop constraint if exists reglages_modules_module_check,
  add constraint reglages_modules_module_check
    check (module in ('pertes', 'groupes', 'mep', 'fiches_salle', 'kds', 'catalogue', 'etages', 'demandes', 'repas'));
drop function if exists public.reglages_modules_bureau_valide(text, jsonb);
