# Unités non reconnues — journal d'amélioration

Ce fichier est un journal vivant pour faire évoluer le dictionnaire d'unités du
service `src/modules/recettes/import/UnitParser.js`.

## Fonctionnement

Lors d'un import (Excel / CSV / PDF), quand `UnitParser.parse()` rencontre une
quantité suivie d'une unité qu'il ne sait pas normaliser, l'unité est :

1. collectée en mémoire pour la session — `getUnrecognizedUnits()` ;
2. affichée dans la bannière jaune de l'écran d'aperçu d'import, pour que
   l'utilisateur corrige les lignes concernées (signalées en rouge) avant insertion.

## Unités déjà couvertes

Poids : g, kg, mg · Volume : ml, cl, l, dl · Cuillères : c.s., c.c. ·
Comptage : unité, pièce, gousse, botte, feuille, verre, tasse · Indéfini : qsp.

Toutes sont converties vers les unités de l'éditeur de recettes
(`g, kg, ml, L, pcs, cs, cc, pincée`) via `toAppUnit()`.

## À enrichir

Quand des unités non reconnues remontent régulièrement dans les imports réels,
les ajouter ici puis dans `UNIT_NORMALIZATION` de `UnitParser.js`.

| Unité rencontrée | Import / contexte | Unité canonique cible |
|---|---|---|
| _(aucune à ce jour)_ | | |
