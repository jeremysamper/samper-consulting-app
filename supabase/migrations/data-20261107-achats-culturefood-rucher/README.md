# Commandes Culturefood du Rucher saisies : APPLIQUÉ EN PROD le 07.11.2026

Jérémy a remis 8 PDF Culturefood (dossier `Samper Consulting\Le Rucher\Factures\culturefood`) en demandant de vérifier que les livraisons étaient entrées, pour la Cuisine.

## Constat avant saisie

Aucune des 6 commandes n'était en base, sur aucun périmètre ni établissement (recherche par fournisseur, par numéro et par libellés). Seule pièce Culturefood existante : la facture 92145297 du 30.09 (périmètre Boissons).

## Saisie

Neuf documents (six, puis trois remis dans la soirée : PDF (6), (7) et (8)),  `bon_commande`, périmètre Cuisine, fournisseur « Culturefood frigemo SA », date = date de livraison, numéro = numéro de commande, total HT = total du bon (somme des lignes vérifiée égale, document par document). Source `pdf`, nom du fichier dans `nom_fichier`. Les PDF ne sont pas joints comme pièces (le stockage ne s'écrit pas par SQL).

| Commande | Commandée le | Livrée le | Lignes | Total HT |
|---|---|---|---|---|
| 0006740193 | 08.10 | 09.10 | 3 | 56.25 |
| 0006740191 | 08.10 | 10.10 | 1 | 10.23 |
| 0006749277 | 10.10 | 12.10 | 3 | 121.60 |
| 0006766175 | 15.10 | 16.10 | 18 | 384.06 |
| 0006774441 | 18.10 | 19.10 | 6 | 44.60 |
| 0006774438 | 18.10 | 22.10 | 3 | 146.76 |
| 0006766173 | 15.10 | 22.10 | 1 | 14.64 |
| 0006774436 | 18.10 | 28.10 | 1 | 27.01 |
| 0006840224 | 05.11 | 06.11 | 3 | 69.77 |

Quantités ramenées à l'unité de l'inventaire Cuisine (lait, crème, blanc d'œuf, œufs pasteurisés et boisson d'avoine en ml ; œufs coquille, burrata, iceberg, kakis en pièces ; le reste en g). Sur les bons, la colonne « Prix » des cartons vaut prix du carton x contenance : seul le « Total » est repris.

Deux lignes marquées à vérifier (champ `issues`) : Kaki (bon : 1 carton à 4.2 kg pour 5.30, saisi 4 pièces) et Poudre d'amande Marguerite (62.39 pour 1 kg, conditionnement probablement plus grand).

## Non saisi

`commande-...(9).pdf` : même commande que (4), 0006766175, déjà saisie. Ligne « Bananen Basic Isobag 12kg » de la commande 0006749277 : 0 kg, prix s.d., 0.00, non livrée, non reprise.


`culturefood-frigemo-sa_2026-11-07.pdf` et sa copie `(1)` (fichiers identiques) : liste imprimée le 07.11 sans numéro de commande ni date de livraison, total 337.17. Ce n'est pas une commande rattachable.

## Effet sur l'état d'inventaire

Période Cuisine de l'inventaire du 26.10 : du 03.10 au 26.10. Les livraisons des 09, 10, 12, 16, 19 et 22.10 y entrent ; celles des 28.10 et 06.11 comptent pour l'inventaire Cuisine suivant (l'inventaire est daté du 26.10 alors que le comptage a eu lieu du 05 au 07.11).

## Rollback

`99-rollback.sql`.
