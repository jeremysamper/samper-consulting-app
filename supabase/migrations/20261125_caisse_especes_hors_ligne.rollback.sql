-- ============================================================================
-- Rollback de 20261125_caisse_especes_hors_ligne.sql (lot 07 du panel)
-- ============================================================================
-- Retire la fonction de rejeu et le journal des rejeux, et rien d'autre : les
-- tickets rejoues restent encaisses, numerotes et scelles par
-- caisse_encaisser, que cette migration n'a jamais touchee.
--
-- Avant de le jouer :
--   - eteindre le reglage « Encaisser en especes sans reseau » dans chaque
--     maison qui l'a allume, et s'assurer qu'aucun appareil ne garde de vente
--     en attente (carte « Ventes en attente d'envoi » vide). Une vente gardee
--     ne pourrait plus se rejouer : son ticket, reste ouvert, se reprendrait
--     en ligne ;
--   - le journal est perdu avec la table : l'exporter d'abord s'il doit etre
--     garde.
-- ============================================================================
begin;

drop function if exists public.caisse_encaisser_hors_ligne(uuid, text, uuid, jsonb, boolean, timestamptz, text);
drop table if exists public.caisse_encaissements_hors_ligne;

commit;
