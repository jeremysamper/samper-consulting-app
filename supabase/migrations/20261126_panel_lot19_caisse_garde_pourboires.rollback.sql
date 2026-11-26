-- ============================================================================
-- Retour du lot 19 du panel (la règle des pourboires gardée par la base).
-- Retire le déclencheur et ses deux fonctions : caisse_reglages retrouve les
-- droits des policies de la v4, le responsable de cuisine peut de nouveau
-- écrire la clé « pourboires » par l'API. Aucune donnée touchée. Se joue
-- avant ou après le front : le front ne dépend pas de la garde (il traduit
-- seulement son message).
-- ============================================================================

drop trigger if exists trg_caisse_reglages_garde_pourboires on public.caisse_reglages;
drop function if exists public.caisse_reglages_garde_pourboires();
drop function if exists public.caisse_pourboires_direction(text);
-- Le retrait de TRUNCATE, TRIGGER et REFERENCES à authenticated n'est pas
-- rendu : aucun écran ne s'en sert, et le rendre rouvrirait TRUNCATE.
