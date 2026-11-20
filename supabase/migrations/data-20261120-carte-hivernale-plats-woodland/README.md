# Woodland Village, Carte hivernale 2026 rangée en plats, 20.11.2026

Demande de Jérémy : remettre toutes les recettes dans les plats associés, selon
la carte imprimée « Carte hiver 2026 Woodland Village ».

## État de départ

L'import du 20.11.2026 (21 h 08) a créé la carte `carte-1795205208352-ym7p` avec
un plat par fiche : 104 plats, 104 fiches, dont 67 sous-fiches (jus, sauces,
pickles, pâtes, garnitures) posées chacune sur un plat à leur nom. Aucun de ces
plats n'est relié à la caisse ni à une autre carte.

## Ce que fait `01-apply.sql`

- Une sous-fiche est un ingrédient qui porte le nom d'une des 104 fiches de
  l'import. Aucune autre fiche de l'établissement n'entre dans le rapprochement.
- Les 37 fiches qu'aucune autre n'utilise sont les plats de la carte. Le script
  compare leur liste à la carte imprimée (table `_carte`) et s'annule au moindre
  écart. Résultat : identique, rubrique par rubrique (entrées, à partager,
  plats, desserts, sur réservation, et les trois suppléments truffe, foie gras
  et alcool, qui restent des plats vendus).
- Chaque plat reçoit sa fiche et toutes ses sous-fiches à toute profondeur
  (110 liens ajoutés, 147 au total), parce que la commande et la MEP ne
  descendent pas dans une fiche citée comme ingrédient. Exemple : le Burger
  hivernal porte le pain burger brioché, la pâte à brioche, les oignons frits,
  la sauce fumée légère, la mayonnaise, les frites et l'assaisonnement Woodland.
- Les 67 plats de sous-fiche sont supprimés (leurs liens suivent en cascade),
  après sauvegarde dans `sauvegarde.carte_hiver_20261120_plats`,
  `_carte_plats` et `_plat_recettes`. Les fiches ne sont pas touchées.

Gardes : carte dans l'état de l'import (104 plats à une fiche), 104 noms
distincts, liste des plats égale à la carte imprimée, aucune fiche sans plat,
aucun plat supprimé relié à la caisse ou à une autre carte, état final
recompté et empreinte des couples plat-fiche.

## Essai à blanc

Joué le 20.11.2026 vers 21 h 20 par la CLI du poste, fichier lu sur le disque :
`plats 37, sous-fiches 67, liens ajoutés 110, plats supprimés 67, liens finaux
147, md5 45f69ebdf39dccda9736675f8e07323a`. Empreinte égale à celle calculée
indépendamment depuis le relevé des fiches. Rien n'est resté après l'essai
(104 plats, aucune table de sauvegarde).

## Application

Appliqué en prod le 20.11.2026 à 23 h 55 sur feu vert de Jérémy, même fichier
que l'essai (md5 du fichier `bae938bc620c135d1d7e7baf1752642e`). Relevé par
`02-verification.sql` : 37 plats, 147 liens, empreinte
`45f69ebdf39dccda9736675f8e07323a`, 67 plats sauvegardés, 104 fiches sur un
plat. Identique à l'essai.

## Fichiers

- `01-apply.sql` : essai à blanc par défaut ; pour appliquer, le faire précéder
  de `select set_config('carte_hiver.appliquer', 'oui', true);` dans la même
  transaction.
- `02-verification.sql` : comptes et empreinte à comparer à l'essai.
- `99-rollback.sql` : revient à un plat par fiche depuis les tables de
  sauvegarde.

Purge prévue des tables de sauvegarde : après la fin de la carte d'hiver.
