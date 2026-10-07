-- Rollback de 20261007_achats_factures_reglement.
-- À jouer seulement après être revenu à un front qui ne lit pas ces colonnes :
-- les montants TTC, échéances et règlements saisis sont perdus.

drop trigger if exists achats_documents_garde_reglement on public.achats_documents;
drop function if exists public.achats_documents_garde_reglement();

alter table public.achats_documents
  drop constraint if exists achats_documents_regle_coherent_chk,
  drop constraint if exists achats_documents_regle_mode_chk;

alter table public.achats_documents
  drop column if exists regle_note,
  drop column if exists regle_mode,
  drop column if exists regle_le,
  drop column if exists date_echeance,
  drop column if exists total_ttc;
