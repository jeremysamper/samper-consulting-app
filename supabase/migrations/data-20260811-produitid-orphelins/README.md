# Réparation des `produitId` orphelins — APPLIQUÉE EN PROD le 11.08.2026

## Le problème

Le catalogue a été ré-importé le **20.05.2026** : les produits ont été supprimés
puis recréés avec de nouveaux ids (`prod-1779237…`). Les recettes ont gardé les
anciens (`prod-1777303…`, du 27.04.2026), soit **55 lignes d'ingrédient pointant
dans le vide** sur 15 recettes actives, un seul établissement.

Ces lignes gardaient leur prix propre, donc le food cost se calculait encore.
Le vrai coût était invisible : elles ne suivaient plus aucune mise à jour du
catalogue depuis presque trois mois, sans que rien ne le signale.

## La règle d'appariement

**Nom + unité** identifie le produit ; le prix ne sert qu'à départager les
homonymes. C'est le sens inverse de l'intuition, et il compte :

- Un prix qui a changé entre deux imports ne remet pas en cause l'identité du
  produit. Exiger l'égalité du prix ne réparait que 12 lignes sur 55.
- En revanche le prix départage parfaitement les homonymes. Le **Basilic**
  existe en `pcs` à 2.95 et en `g` à 0.0294 : un appariement sur le nom seul
  (trié par `actif`) retenait la version `pcs`, ce qui aurait transformé
  « 60 g de basilic » en « 60 pièces ». Idem pour le **Thym** (0.0296 en 250 g,
  0.0598 en 50 g) et les **Échalotes**.

Tout appariement non unique est **refusé** plutôt que tranché au hasard.

## Ce que le script modifie

**Uniquement la clé `produitId`.** Ni `unite`, ni `prixUnit`, ni `quantite`.
Aucune valeur affichée ne change : seul le lien est rétabli. Le re-chiffrage
éventuel (certains produits ont un prix catalogue 10× à 1000× différent du prix
figé dans la recette) reste une décision humaine, à prendre fiche par fiche.

## Résultat constaté en production

| Contrôle | Valeur |
|---|---|
| Lignes comparées à la sauvegarde | 88 |
| `produitId` réparés | **27** |
| Unités modifiées | 0 |
| Prix modifiés | 0 |
| Quantités modifiées | 0 |
| Lignes perdues ou ajoutées | 0 |
| Orphelins restants | 28 |
| Liens valides au total | 24 → **51** |

## Les 28 lignes restantes

Volontairement laissées en l'état, elles demandent un arbitrage humain :

- **26 lignes** : aucun produit du catalogue ne porte ce nom avec cette unité.
  Soit le produit a disparu au ré-import (JuraSel sel de table à lui seul en
  concerne 10, Quality jus de citron 3), soit son unité a changé — c'est le cas
  de l'**estragon**, passé du gramme à la pièce.
- **2 lignes** : homonymes strictement identiques au catalogue (même nom, même
  unité, même prix, même conditionnement), donc indépartageables. Ce sont des
  doublons du catalogue, à dédupliquer côté produits.

Le bon endroit pour les traiter est l'écran `AmbiguousMatchReview`, qui existe
déjà pour ça.

## Ordre d'exécution

1. `00-sauvegarde.sql` — table `backup_recettes_ingredients_20260811` (additive).
2. `01-reparer-liens.sql` — se termine par `rollback;` : remplacer par `commit;`
   après relecture.
3. `02-verification.sql` — compare avant/après ligne à ligne.
4. `99-rollback.sql` — restaure si besoin.

La table de sauvegarde est **conservée**. La supprimer une fois la réparation
définitivement validée (`drop table backup_recettes_ingredients_20260811;`).

## Validation

Séquence complète rejouée sur un vrai Postgres (PGlite) avec 10 cas d'essai
reproduisant les pièges réels : basilic g/pcs, thym en deux conditionnements,
crème dupliquée, estragon sans équivalent d'unité, prix différent mais match
unique, lien déjà valide, homonyme dans un autre établissement (isolation
multi-tenant), et recette multi-lignes pour vérifier que l'ordre du tableau
JSONB est préservé. 22 assertions, rollback compris, toutes vertes.
