# Carte Automnale Woodland : trois plats de fettuccine et deux plats enfants

Appliqué en prod le 15.11.2026 (essai à blanc conforme avant, puis `01-apply.sql`).
Source : la carte imprimée `Carte-automne-Woodland-4-2.png` (page Plat).

## Ce qui change

- Le plat « Tagliolini aux champignons des bois » (0.-) devient « Fettuccine aux champignons des bois » (28.-, végétarien). Même identifiant, donc le bouton de caisse qui le visait suit.
- Deux plats neufs : « Suprême de volaille jaune » (36.-) et « Pigeon rôti » (39.-).
- Catégorie neuve « Enfants » : « Poulet ultra croustillant » (15.-) et « Fettuccine bolognaise » (15.-).
- Plats rangés dans l'ordre de la carte (Entrecôte 4, Poulpe 7, Courge 9).

## Fiches

- « Pâte à tagliolini fraîche » devient « Pâte à fettuccine fraîche » (7 mm, 2 minutes 30), oeufs déclarés.
- « Base sauce aux champignons des bois » : bouillon de légumes à la place du fond blanc de volaille. Sans ce changement, le plat végétarien ne l'était pas. Une seule base pour les trois plats.
- « Pigeon, filets et cuisses confites » : 16 portions au lieu de 40 (8 pigeons, un filet et une cuisse par assiette).
- L'ancienne fiche des trois versions, masquée, devient la fiche du plat végétarien.
- Fiches neuves, à 10 portions, quantités pour le total et grammage par assiette en première étape : volaille, pigeon, poulet ultra croustillant (aiguillettes marinées 24 h à l'ayran, pressées dans les cornflakes, frites crues à 170 °C), fettuccine bolognaise ; « Sauce bolognaise maison » à 20 portions.

## Retour arrière

`99-rollback.sql` relit les tables `sauvegarde.carte_automnale_20261115_*`.
