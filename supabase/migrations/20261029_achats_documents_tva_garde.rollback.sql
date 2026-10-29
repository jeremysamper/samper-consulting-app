-- Rollback de 20261029_achats_documents_tva_garde.
-- À jouer AVANT 20261029_achats_documents_tva.rollback.sql : le déclencheur
-- porte sur les colonnes tva_taux et montant_tva, que l'autre rollback supprime.
-- Retire la garde du taux et du montant de TVA, la borne du taux et l'index sur
-- fournisseur_id ; les colonnes et leurs valeurs restent.

set local lock_timeout = '5s';

drop trigger if exists achats_documents_garde_tva on public.achats_documents;
drop function if exists public.achats_documents_garde_tva();

alter table public.achats_documents
  drop constraint if exists achats_documents_tva_taux_chk;

drop index if exists public.achats_documents_fournisseur_idx;

comment on column public.achats_documents.tva_taux is
  'Taux de TVA de la pièce, en pour cent (2.6 alimentaire, 8.1 normal, 3.8 hébergement, 0 exonéré, ou taux étranger). Lu par l''IA à l''import, corrigeable avec le droit manage:factures_achat. NULL = non lu.';
