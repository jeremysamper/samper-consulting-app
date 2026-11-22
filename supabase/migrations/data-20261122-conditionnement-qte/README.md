# Conditionnement de commande, lot 4a, données : PRÊT, NON APPLIQUÉ

À jouer après `20261122b_lot4a_commande_base.sql` (colonne
`produits.conditionnement_qte`), hors service (pas de 11 h à 14 h 30 ni de
18 h à 22 h 30, heure de Zurich), et avant le front du lot 4b, qui arrondit la
commande au conditionnement.

## Ce que le script modifie

`produits.conditionnement_qte` est lu dans le texte `produits.conditionnement`
déjà saisi : « [n x] quantité unité » (kg, g, l, dl, cl, ml, pièces), converti
dans l'unité de référence du produit. « Sac 5 kg » donne 5000 (g), « Pack de
6 x 1.5 l » donne 9000 (ml), « Paquet de 50 pièces » donne 50 (pcs). Une ligne
n'est remplie que si la famille d'unité lue est celle de `unite_ref` ; une
valeur déjà posée n'est jamais touchée.

Aperçu du 22.11.2026 (lecture seule) : 763 produits ont un libellé ; 709 sont
remplis ; 30 ont une famille différente (« 200 g » pour un produit compté en
pièces) et 24 n'ont pas de quantité lisible (« 2 bottes », « Carton de 10
sachets »). Ces 54 se règlent dans le catalogue.

Le journal d'activité et `updated_at` ne suivent pas ce remplissage : leurs
deux déclencheurs sont coupés le temps de la transaction (le verrou de
l'`alter table` tient jusqu'au commit, aucune autre écriture ne passe sans
eux). Une ligne de journal par établissement le dit à la place.

## Ordre

1. `00-sauvegarde.sql` : compte (doit être 0) et repère des modifications du jour.
2. `01-remplissage.sql` : une transaction, tout ou rien.
3. `02-verification.sql` : comptes par établissement et par unité, dix exemples.
4. En cas de besoin : `99-rollback.sql` (ne vide que les valeurs encore égales
   à la lecture du libellé).

La démo (`src/demo/donnees/commande.js`, `conditionnementQte`) lit les
libellés de la même façon.
