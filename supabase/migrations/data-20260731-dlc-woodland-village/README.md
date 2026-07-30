# 31.07.2026 · Durées de vie (DLC) de la Carte Estivale 2026, Woodland Village

Mise à jour **de données**, pas de schéma. Sous-dossier de `migrations/` pour
que la CLI Supabase ne le rejoue pas, même convention que `sprint-4-c3/` et que
`data-20260731-dlc-hotel-central/`.

**Déjà appliqué en production le 31.07.2026.** Ces fichiers sont la trace et le
retour arrière, pas une tâche en attente.

## Périmètre

56 fiches recette rattachées à la carte `carte-1783280207338-590o`
(« Carte Estivale 2026 », établissement `etab-2`).

8 de ces fiches servent aussi la « Carte Printemps 2026 », archivée : ce sont
les mêmes fiches, elles suivent donc les mêmes durées (beurre aux agrumes,
bouillon vin rouge, condiment œuf, mousseline d'épinards, œuf poché frit,
poudre de lard sec, sel épicé pour frites, vinaigrette balsamique miel).

## Barème retenu

Identique à Hotel Central. `duree_vie_jours` limité à **3 / 5 / 7 jours** :

- **3 j** : cru, laitier frais, œuf, produit de la mer, découpe fraîche
- **5 j** : cuit ou stabilisé (acide, sous-vide, blanchi, pasteurisé léger)
- **7 j** : très stabilisé (sucre, sel, acide, gras, sec, fermenté, pot stérilisé)

`duree_vie_congele_jours` reçoit la durée réelle à -18 °C par famille, à la
place du 90 j forfaitaire : viennoiseries, pâtes fraîches et poisson cru 60 j,
fruits confits en sirop 180 j, cuissons sous-vide 90 j, `NULL` pour les gels,
les meringues, les condiments à l'huile et les crus taillés à la commande.

## L'exception assumée

**Langoustines basse température : 1 jour, pas 3.** Leur fiche plafonne à 24 h
entre 0 et 2 °C avant le passage au bain à 54 °C. Poser 3 jours sur l'étiquette
aurait été plus permissif que la fiche. Elles passent aussi en non congelable :
on ne recongèle pas une langoustine.

## Cas où la fiche a primé sur le barème

- **Coquelet basse température** : 3 j, parce que la fiche écrit « réserver au
  froid 3 jours ou congeler ». La pintade, même technique mais sans limite
  écrite, est à 5 j.
- **Chips de viande séchée** (7 j au sec), **glaçage miel moutarde** (2 semaines
  à +3 °C), **huile de pêche** (surgelée, 3 mois), **mousseline de courgette**
  (-18 °C, 2 mois) : valeurs reprises telles quelles de leurs fiches.

## Retour arrière

`99-rollback-dlc.sql` contient l'état exact des 56 fiches avant l'opération.
