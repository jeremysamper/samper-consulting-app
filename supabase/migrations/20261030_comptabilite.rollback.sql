-- Rollback de 20261030_comptabilite.
-- À jouer seulement après être revenu à un front qui ne lit pas ces tables
-- (module Comptabilité retiré). Les saisies de la Comptabilité (chiffre du
-- jour, charges fixes, salaires estimés, réglages, relevés) partent avec leurs
-- tables ; aucune donnée existante n'est touchée, achats_documents reste tel
-- quel. La publication realtime suit la table. Ordre : les lignes avant leur
-- relevé.

drop table if exists public.releve_lignes;
drop table if exists public.releves_bancaires;
drop table if exists public.salaires_estimes;
drop table if exists public.charges_fixes;
drop table if exists public.ventes_jour;
drop table if exists public.compta_reglages;
