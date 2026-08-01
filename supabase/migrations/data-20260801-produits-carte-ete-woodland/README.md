# 01.08.2026 · Produits de la carte Été 2026, Woodland Village

Mise à jour **de données**, pas de schéma. Sous-dossier de `migrations/` pour
que la CLI Supabase ne le rejoue pas, même convention que
`data-20260731-dlc-woodland-village/`.

**Déjà appliqué en production le 01.08.2026.** Ces fichiers sont la trace et le
retour arrière, pas une tâche en attente.

## Périmètre

17 fiches recette créées sur l'établissement `etab-2`, pour que l'onglet
« Étiquettes DLC » du module HACCP couvre toute la carte été. Aucune n'existait
avant : la carte a été confrontée aux 168 fiches de l'établissement nom par nom
avant l'insertion, il n'y a donc pas de doublon.

**Deux origines.** Huit préparations sont *citées dans les descriptifs* de la
carte sans avoir jamais eu de fiche (les pickles, le concombre mariné, la
salade fraîcheur, les champignons, les noisettes torréfiées, le pesto estival).
Neuf sont des produits demandés en complément (entrecôte, tartare, fromage,
charcuterie, les deux fondues, chocolat Danemark, gambas, sauce gambas).

Les glaces sont hors périmètre : ni la Coupe Danemark, ni la boule de glace, ni
le café glacé. Le « Chocolat Danemark » créé ici est la **sauce chocolat chaud**
qui accompagne la coupe, pas la coupe elle-même.

## Barème retenu

Identique à celui du 31.07.2026. `duree_vie_jours` limité à **3 / 5 / 7 jours** :

- **3 j** : cru, laitier frais, œuf, produit de la mer, découpe fraîche
- **5 j** : cuit ou stabilisé (acide, sous-vide, blanchi, pasteurisé léger)
- **7 j** : très stabilisé (sucre, sel, acide, gras, sec, fermenté)

`duree_vie_congele_jours` reçoit 90 j pour ce qui se congèle réellement, `NULL`
pour le reste (marinades, produits secs, crus, fromage et charcuterie).

## L'exception assumée

**Tartare de bœuf : 1 jour, pas 3, et non congelable.** Du bœuf cru taillé au
couteau ne se garde pas trois jours ; poser le plancher du barème aurait été
plus permissif que la pratique. C'est le même raisonnement que les langoustines
basse température du 31.07.2026.

## Deux arbitrages à relire

- **Concombre mariné à 5 j et non 7** : marinade légère sur un légume cru gorgé
  d'eau, ce n'est pas une conserve acide comme les pickles.
- **Gambas non congelables** : livrées décongelées, on ne recongèle pas.

## Ces fiches sont des squelettes

Ni ingrédients, ni étapes, ni allergènes — elles existent pour l'étiquetage.
Le champ `notes_consultant` de chacune le dit et rappelle que la durée reste à
confirmer par l'autocontrôle. À enrichir depuis le module Cartes & Recettes.

## Retour arrière

`99-rollback-produits.sql` supprime les 17 fiches (elles n'existaient pas
avant, il n'y a aucun état antérieur à restaurer). Il commence par une requête
de contrôle qui vérifie qu'aucune n'a été enrichie ou rattachée à un plat
depuis.
