# Détection des `prixUnit` inversés (conversion d'unité)

Diagnostic **en lecture seule** lié au correctif du 11.08.2026 sur
`adjustPrixUnitForUnit` et ses 4 sites appelants.

## Le bug

Un prix par unité (CHF/g) est une grandeur **inverse** de la quantité.
`convertFactor('kg','g')` vaut 1000 : la quantité se multiplie par ce facteur,
le prix se divise. Le code écrivait `prix * facteur`, d'où un écart d'un
facteur `facteur²`, soit 10⁶ entre g et kg.

Le correctif n'agit qu'à l'écriture. Les `prixUnit` déjà enregistrés en base
restent faux : c'est ce que ces requêtes mesurent.

## Comment lancer

Supabase Dashboard → SQL Editor → coller `01-detection.sql`. Les trois requêtes
sont indépendantes et peuvent être exécutées séparément. Aucun DDL, aucune
écriture : rien à annuler.

| Requête | Ce qu'elle trouve |
|---|---|
| **A** | Détection déterministe : ingrédient lié au catalogue, unité différente mais compatible, dont le prix stocké colle à la formule inversée et pas à la formule correcte. Donne `prix_attendu` et `cout_ligne_corrige`. |
| **B** | Balayage heuristique : prix ou quantités invraisemblables, sans dépendre du catalogue. Seuils repris de `detectAberrantPrice` ([Catalogue.jsx:64](../../../src/modules/catalogue/Catalogue.jsx)). |
| **C** | Comptage par établissement, pour décider si une reprise vaut le coup. |

Commencer par **C**. Si le compte est faible, corriger à la main dans l'app
(rouvrir la fiche, relier le produit) est plus sûr qu'un UPDATE de masse.

## Pourquoi deux requêtes

Les 4 sites corrigés ne laissent pas la même trace :

- Les 3 sites « lien produit catalogue » écrivaient un prix faux **seul**. Le
  coût de la ligne devient absurde, et le catalogue permet de recalculer la
  valeur correcte. C'est la requête A, exacte.
- Le site « changement d'unité dans le select » inversait quantité **et** prix
  ensemble. `quantite × prixUnit` restait donc juste et A ne peut pas le voir,
  faute d'écart de coût. Seule la vraisemblance du couple trahit la ligne :
  c'est la requête B, heuristique, à relire à l'œil.

## Limites à connaître

1. **A compare au prix catalogue d'aujourd'hui.** Depuis le sprint « prix
   vivants » le prix d'un produit évolue. Une recette saisie quand le beurre
   était à 4.50 CHF/kg ne matchera pas si le catalogue affiche 5.00 aujourd'hui.
   La tolérance de 2 % absorbe l'arrondi d'écriture, pas une vraie hausse de
   tarif. A sous-estime donc plutôt qu'elle ne sur-signale : croiser avec B.
2. **B est indicative.** Un produit réellement cher (safran, truffe) peut
   dépasser 10 CHF/g légitimement. Rien ne doit être corrigé sans relecture.
3. **Le fournisseur principal** est résolu comme `mapProduitFromDB` (principal,
   sinon `produits.prix_unitaire`). Quand plusieurs lignes portent
   `est_principal`, l'ordre de départage peut différer de celui rendu par
   PostgREST au front.
4. **La casse des unités est volontairement respectée** (`L` et non `l`), pour
   coller exactement à `convertFactor` : une ligne saisie en `l` minuscule n'a
   jamais été convertie et ne doit pas ressortir.
5. **Les recettes archivées sortent aussi** (colonne `statut`), à filtrer si
   besoin.

## Validation

Les trois requêtes ont été exécutées sur un vrai Postgres (PGlite) avec 14 cas
d'essai couvrant les deux sens de conversion, la clé legacy `prix_unit`, les
valeurs non numériques, `ingredients` null ou non-tableau, les unités
incompatibles, et la résolution du prix fournisseur. 18 assertions, toutes
vertes. Le jeu d'essai n'est pas versionné : c'est un diagnostic ponctuel.
