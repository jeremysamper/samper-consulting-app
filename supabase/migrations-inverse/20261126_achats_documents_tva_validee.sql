-- Inverse de 20261126_achats_documents_tva_validee.sql.
-- À jouer seulement après le retour du front à une version qui n'écrit plus
-- tva_validee_le (majFactureAchat l'envoie avec chaque TTC ou taux).
alter table public.achats_documents drop column if exists tva_validee_le;
