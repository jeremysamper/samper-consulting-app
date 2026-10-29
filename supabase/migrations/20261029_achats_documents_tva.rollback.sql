-- Rollback de 20261029_achats_documents_tva.
-- À jouer seulement après être revenu à un front qui ne lit pas ces colonnes :
-- les taux et montants de TVA lus ou corrigés sont perdus.

alter table public.achats_documents
  drop column if exists montant_tva,
  drop column if exists tva_taux;
