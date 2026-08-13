# Liaison en masse des ingrédients au catalogue — Woodland Village

Opération de données appliquée en production le **12.08.2026**. Ce dossier est une
trace : la CLI ne rejoue pas les sous-dossiers de `migrations/`.

## Ce qui a été fait

Rattachement automatique des ingrédients de recettes aux produits du catalogue, pour
que le coût matière se calcule sur le prix vivant du catalogue plutôt que sur la copie
figée dans la recette (voir `src/services/prixResolution.js`).

**Périmètre : Woodland Village (`etab-2`) uniquement.** Les trois autres établissements
n'ont aucun produit au catalogue, il n'y a donc rien à quoi les rattacher :

| Établissement | Ingrédients non liés | Produits au catalogue |
|---|---:|---:|
| Woodland Village (`etab-2`) | 1 072 | 803 |
| Le Rucher d'Evolène | 886 | **0** |
| Hôtel Panorama | 618 | **0** |
| Concours TGV Lyria | 108 | **0** |

## Le tier appliqué, et pourquoi celui-là seulement

`matchIngredient` procède en trois passes. Seule la **passe 1** a été appliquée :

- **passe 1, égalité exacte du nom normalisé** (confiance 100) — appliquée.
  Aucune part de jugement : le nom de l'ingrédient et celui du produit sont le même
  texte une fois la casse, les accents et la ponctuation retirés.
- **passe 2, Levenshtein ≤ 2** (confiance 85) — **écartée**. Elle a produit
  `poires → Poireau` (distance 2), deux ingrédients sans rapport. Sur des mots courts,
  deux caractères d'écart sont un écart relatif énorme. Les 3 autres propositions
  étaient correctes (`oignon rouge → Oignons rouges`, `courgette → Courgettes`,
  `poireaux → Poireau`) mais ne justifient pas d'écrire un lien faux.
- **passe 3, Jaccard tokenisé** — ne produit que du statut `ambiguous`, réservé à la
  revue humaine dans l'écran « Lier les ingrédients au catalogue ».

Exclusions supplémentaires : ingrédients non commerciaux isolés (`sel`, `poivre`, `eau`,
`glace`, `glaçon`) comme dans `matchIngredient`, et noms de produits présents plusieurs
fois au catalogue (homonymes), pour ne jamais choisir arbitrairement.

Seul `produitId` est posé. `unite` et `prixUnit` sont laissés intacts : le prix réel est
résolu à la lecture et converti dans l'unité de l'ingrédient par `convertPrix`. Écrire
la conversion en SQL aurait dupliqué une logique déjà testée côté JS.

## Résultat

| Mesure | Valeur |
|---|---:|
| Liens avant | 79 |
| Liens après | 138 |
| **Nouveaux liens** | **59** |
| Recettes touchées | 73 |
| Noms distincts rattachés | 31 |
| Ingrédients perdus, renommés, requantifiés | **0** |
| Liens orphelins créés | **0** |

Sur les 138 liens : 28 sont des orphelins **préexistants** (produit supprimé), 110 sont
valides, dont 85 avec une unité convertible donc un prix réellement vivant. Les 25 autres
ont une unité incompatible (ingrédient en g, produit en pcs) et retombent sur `prixUnit`
en le signalant, conformément à `describePrixIngredient`.

## Deux constats à traiter

**1. Quinze prix figés étaient faux d'une puissance de dix.** Tous sur des liens
antérieurs à cette opération, aucun sur les 59 nouveaux. Facteurs relevés : ×10, ×100,
×1000 exactement — la signature du `convertFactor` inversé corrigé le 11.08.2026
(voir `data-20260811-prix-unit-inverses/`). Le passage au prix vivant les corrige
d'office puisqu'il ignore la copie figée.

**2. Un prix de catalogue est faux : `Economy Huile pour friture`.**
Enregistré à `0.189 CHF/ml`, soit **189 CHF le litre**, pour une caisse de 20 l. À
comparer aux autres huiles du même catalogue : tournesol 4,45 CHF/l, olive vierge extra
7,09 CHF/l. La valeur correcte est vraisemblablement `0.00189` (facteur 100), qui est
exactement le prix figé qu'on retrouve dans « Vinaigrette balsamique miel ».

Conséquence tant que ce n'est pas corrigé : cette recette affiche **1 890 CHF** pour ses
10 litres d'huile, et « Huile de basilic » 189 CHF. **À corriger à la main dans le
catalogue** — le prix n'a pas été modifié ici, un prix d'achat relève de Jérémy.

## Restauration

La table `bak_20260812_liaison_ingredients` contient l'état complet des ingrédients des
185 recettes de `etab-2` avant écriture. Voir `99-rollback.sql`.
