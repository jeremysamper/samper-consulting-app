# Menus de groupe Woodland Village, import du 14.10.2026

Les menus mariage, groupes au restaurant et séminaires de Woodland Village
(établissement `etab-2`), dans le modèle de la migration
`20261014_groupes_menus_a_choix.sql` : un menu par palier de prix, chaque ligne
porte sa saison (été, mai à septembre ; hiver, octobre à avril) et, s'il y a
lieu, une fenêtre plus courte (« de mai à juin »).

| Type | Menus | Numéros |
|---|---|---|
| Mariage | L'essentiel 75, Le grand repas 95, Prestige 119, Gastronomique 135 | 1 à 4 |
| Mariage, compléments | apéritif (37 pièces, classique ou premium), 15 stations, 16 gâteaux, 5 mignardises | 0 |
| Groupe au restaurant | 39, 45, 55, 69, 75, 95 CHF | 1 à 6 |
| Séminaire | 59, 75, 95 CHF | 1 à 3 |

14 menus, 459 lignes. Numérotation validée par Jérémy : n°1 = le moins cher. Le
mariage n°3 déjà réservé pour le 29.06.2028 correspond donc au menu Prestige.

## Source

Les 7 PDF remis le 14.10.2026 (non versionnés : documents client) :
Woodland_Mariage_Mai_a_Septembre, Woodland_Mariage_Octobre_a_Avril,
Mariage_Fiche_de_choix, Woodland_Groupes_Mai_a_Septembre_selection,
Woodland_Groupes_Octobre_a_Avril_selection, Woodland_Seminaires_Mai_a_Septembre,
Woodland_Seminaires_Octobre_a_Avril.

Chaîne : `dump.mjs` (texte positionné par pdf.js) puis `parse.mjs` (rubriques,
colonne de régime, fenêtres, marques premium et chaud, prix des stations) puis
`gen-import.mjs` (SQL). Contrôles faits avant import : le nombre de lignes des
menus groupes et séminaires égale le nombre de cases à cocher des PDF (95, 96,
47, 45), aucune ligne d'entrée, de plat ou de poisson sans régime, apéritif
conseillé de chaque menu retrouvé dans la fiche de choix.

## Liaisons aux fiches

Seules deux correspondances exactes avec la carte Woodland sont reliées : la
fondue moitié-moitié (groupes 39 et 45) et le Paris-Brest (gâteau). Les plats de
la carte au nom voisin (poulpe en double cuisson, truite marinée, carpaccio de
betteraves, tomate et burrata, salade mêlée) n'ont pas la même garniture que la
version des menus : les relier ferait commander les mauvaises garnitures. Ils se
relient dans l'app, onglet Menus, vue « Plats à relier », une fois pour tous les
menus.

Les allergènes des PDF sont des pictogrammes dessinés, non importés : dans l'app,
ils viennent des fiches techniques, et un plat sans fiche s'affiche « allergènes
non vérifiés ».

## Fichiers

- `01-import-menus.sql` : l'insertion (idempotente, `on conflict do nothing`).
- `02-verification.sql` : comptes et empreinte des lignes, à comparer au relevé.
- `99-rollback.sql` : retire les 14 menus importés (ids `woodland-*`).

Aucune sauvegarde préalable : `groupe_menus` était vide pour `etab-2` (0 ligne,
relevé le 14.10.2026 avant import).
