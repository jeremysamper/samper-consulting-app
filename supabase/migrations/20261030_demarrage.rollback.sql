-- Rollback de 20261030_demarrage : retire les deux tables de la mise en route.
-- Le front de LD lit ces tables en mode « échec = carte cachée » : il continue
-- de tourner après ce rollback (plus de carte, page de mise en route vide).
-- Les lignes d'exemple déjà chargées restent dans recettes, cartes et produits :
-- les effacer AVANT ce rollback (bouton « Effacer l'exemple »), le registre
-- disparaît avec la table.

-- Les clés étrangères vers etablissements demandent un verrou bref sur cette
-- table : ne pas attendre derrière une transaction longue.
set local lock_timeout = '5s';

drop table if exists public.donnees_exemple;
drop table if exists public.demarrage_etapes;
