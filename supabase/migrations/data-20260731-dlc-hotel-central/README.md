# 31.07.2026 · Durées de vie (DLC) des cartes d'Hotel Central / Le Rucher

Mise à jour **de données**, pas de schéma : aucune colonne n'est créée ni modifiée.
Le dossier est volontairement un sous-dossier de `migrations/` afin que la CLI
Supabase ne le rejoue pas automatiquement (même convention que `sprint-4-c3/`).

**Déjà appliqué en production le 31.07.2026.** Ces fichiers sont la trace et le
retour arrière, pas une tâche en attente.

## Périmètre

Les 84 fiches recette rattachées aux trois cartes de l'établissement
`etab-1777157340476` :

| Carte | id |
|---|---|
| Carte Mensuelle PDJ | `carte-1782730469396-x85i` |
| Buffet PDJ | `carte-1782730452725-wg48` |
| Beverage | `carte-1782730504404-8818` |

Ces 84 recettes ne sont utilisées par aucune autre carte : la mise à jour ne
déborde sur aucun autre service.

## Barème retenu

`duree_vie_jours` (froid positif) est limité à **3 / 5 / 7 jours**, à la demande
de Jérémy, pour que l'étiquette reste lisible par la brigade :

- **3 j** : cru, laitier frais, œuf, produit de la mer, découpe fraîche
- **5 j** : cuit ou stabilisé (acide, sous-vide, blanchi, pasteurisé léger)
- **7 j** : très stabilisé (sucre, sel, acide, gras, sec, fermenté, pot stérilisé)

`duree_vie_congele_jours` reçoit la **durée réelle à -18 °C** par famille, à la
place du 90 j forfaitaire posé par `20260730_recettes_durees_vie.sql` :
viennoiseries et inserts pâtissiers 60 j, poisson cru 60 j, purée de fruit
pasteurisée 180 j, granité et pomme de terre cuite 30 j, `NULL` (non congelable)
pour les gels, les ferments vivants, l'avocat et les appareils à l'œuf cru.

`duree_vie_decongele_jours` reste à 2 j partout, sauf le gravlax d'omble
chevalier ramené à 1 j (poisson cru).

`congelable` (qualification MEP, notion distincte de `duree_vie_congele_jours`)
n'est touché que sur les 3 fiches repassées non congelables, pour que la MEP et
le poste d'étiquetage disent la même chose.

## Lecture des 7 jours

Pour les préparations dont la fiche annonce une garde plus longue (cordiaux
6 semaines fermé, confitures et vinaigre en pot stérilisé, granola, muesli, sel
fumé, pâtes de fruits, tuiles), le 7 j se lit **DLC entamé** : c'est le sens de
l'étiquette, posée au moment du décantage. La garde de la bouteille ou du pot
fermé reste celle écrite dans les étapes de la fiche.

## Retour arrière

`99-rollback-dlc.sql` contient l'état exact des 84 fiches avant l'opération
(`duree_vie_jours`, `duree_vie_congele_jours`, `duree_vie_decongele_jours`,
`congelable`). À coller tel quel dans le SQL Editor.
