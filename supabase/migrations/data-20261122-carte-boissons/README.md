# Carte des boissons, lot A, données : APPLIQUÉES EN PROD le 22.11.2026

À jouer après `20261122_carte_boissons_formats.sql` (colonne `cartes.genre`,
table `plat_formats`). Les trois fichiers SQL sont générés depuis
`briefs/2026-11-22-carte-boissons-woodland-formats.json` par le script du banc
du lot A : aucune valeur n'est recopiée à la main.

## Ce que le script modifie

1. `genre = 'boissons'` sur les 6 cartes de boissons du brief (décision D3) :

   | Carte | Établissement | Plats |
   |---|---|---|
   | Beverage | Rucher (etab-1777157340476) | 17 |
   | Carte des spiritueux | Rucher | 18 |
   | Carte des vins DTD | Rucher | 13 |
   | Carte des vins Premium | Rucher | 15 |
   | Carte des vins dégustations | Rucher | 5 |
   | Carte des vins | Woodland (etab-2) | 48 |

   Le front en ligne ne lit pas la colonne : rien ne bouge à l'écran avant le
   lot B.
2. Les formats des 48 vins de Woodland (`wl-vin-01` à `wl-vin-48`), 73 en
   tout : 28 vins à un format, 15 à deux, 5 à trois. Ordre : 1 dl, 37,5 cl,
   50 cl, 75 cl. Les prix de vente des vins ne changent pas (ils valent déjà
   le prix du plus grand format).

Le script est une seule instruction (un bloc DO), tout ou rien. Il refuse de
tourner si une carte n'a pas l'établissement, le nom ou le nombre de plats
attendus, ou si l'un des 48 vins manque à la Carte des vins de Woodland. Au
rejeu il est inerte : une carte déjà en boissons n'est pas réécrite, un vin
qui a déjà des formats n'en reçoit aucun.

Pas de `00-sauvegarde` : l'état d'avant est entièrement connu (la colonne
`genre` venait d'être créée à `'mets'` pour toutes les cartes, la table
`plat_formats` était vide), et `99-rollback.sql` le rétablit.

## Essai à blanc (22.11.2026, sur la prod, transaction annulée)

Script joué deux fois (comptes attendus, puis rejeu sans effet), vérification
`02` sans écart, puis contrôle par les règles qui liront ces données : le temps
de l'essai, la commande QR de Woodland allumée, la Carte des vins vendue et
trois vins posés dans « Vins ».

- Carte publique : Fendant (wl-vin-01) en 1 dl à 3.50 et 50 cl à 17.00 ;
  Pinot blanc Travaletti (wl-vin-14) en 75 cl à 49.00 ; wl-vin-42 en 1 dl,
  37,5 cl et 75 cl, dans cet ordre.
- Envoi : Fendant 1 dl + Fendant 50 cl + Pinot blanc sans format choisi
  (format unique) = 69.50.
- Fendant sans format choisi : refusé (`erreur: 'format'`).

Rien n'a été allumé à Woodland hors de l'essai : la commande QR reste éteinte
et la Carte des vins n'est pas cochée dans la Caisse.

## Résultat constaté en production

`02-verification.sql` en lecture seule : `cartes = 6`, `vins = 48`,
`formats = 73`, `ecarts = 0`.

## Retour arrière

`99-rollback.sql` : supprime les formats des 48 vins de Woodland et remet les
6 cartes en `'mets'`. Une seule instruction.
