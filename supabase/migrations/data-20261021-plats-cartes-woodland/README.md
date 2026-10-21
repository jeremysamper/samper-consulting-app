# Woodland Village, cartes rangées en plats, 21.10.2026

Demande de Jérémy : dans Outils consultant > Plats & Recettes, ranger les fiches
de Woodland Village (`etab-2`) dans des plats, sur la carte Brunch et sur six
nouvelles cartes de groupe. Appliqué en prod le 21.10.2026 vers 5 h 45 (heure
de Zurich), hors service.

## Ce qui a été créé

| Carte | Plats | Recettes |
|---|---|---|
| Brunch (existante, vide) | 106 | 314 |
| Groupes hiver | 60 | 182 |
| Groupes été | 61 | 183 |
| Mariages hiver | 124 | 373 |
| Mariages été | 118 | 341 |
| Séminaires hiver | 31 | 110 |
| Séminaires été | 33 | 110 |

6 cartes (`carte-woodland-*`), 269 plats (261 `wl-ev-*`, 8 `wl-brunch-*`),
1166 liaisons fiche > plat, 533 liaisons carte > plat. « Recettes sans plat »
passe de 648 à 6.

## Règles

**Cartes de groupe.** Source : les lignes des 14 menus de `groupe_menus`
(import du 14.10.2026). Un plat par fiche de dressage, nommé comme la fiche,
qui porte la fiche et toutes ses sous-fiches à toute profondeur : la commande
et la MEP ne descendent pas dans une fiche citée comme ingrédient, il faut
donc toute la chaîne sur le plat. Une ligne sans saison vaut pour l'été et
l'hiver. Un plat présent dans plusieurs menus ou cartes est créé une fois et
relié à chaque carte. La fondue moitié-moitié garde son plat existant (déjà
relié aux menus 39 et 45). Catégories de plat : Apéritifs, Stations, Entrées,
Poissons, Trou valaisan, Plats, Fromages, Desserts, Gâteaux, Mignardises.

**Brunch.** Les 54 recettes du brunch de juin (plats « Brunch - Patisserie »
et « Brunch - Planches » de la Carte Printemps 2026, plus les pancakes) dans
7 plats de tri : Pâtisserie sucrée, Verrines sucrées, Pâtisserie salée,
Verrines salées, Tartines et mini-sandwichs, Dips et tartinables, Bouchées et
tartares. Une recette assemblée à partir d'autres fiches a son propre plat
(Mini-club). S'y ajoutent, reliés sans copie, les plats des menus de groupe
en apéritif, trou valaisan, dessert, gâteau, mignardises et stations, et les
10 desserts des cartes Automnale, Estivale et Printemps (choix de Jérémy).
Les plats « Brunch - … » de la Carte Printemps 2026 n'ont pas bougé.

## Correspondances à la main

Les libellés des menus écrits autrement que leur fiche (apostrophe
typographique, pluriel, « de saison ») sont listés dans `01-apply.sql`, table
`_ovr`. Approximations à faire vérifier par le chef :

- Groupes été, « Filet mignon de porc, sauce moutarde à l'ancienne » : seule
  fiche existante, avec mousseline de chou-fleur et haricots verts.
- Groupes hiver, fondue de viande « pommes grenailles rôties au thym » :
  fiche « aux herbes ».
- Séminaires, « crumble au sésame » : fiche « crumble miel et sésame »
  (compotée d'abricots), été comme hiver.
- Séminaires, sandre « mousseline de fenouil » : fiche avec pois gourmands.
- Blanquette : la fiche homonyme est la blanquette seule, la fiche de dressage
  est « Blanquette de veau à l'ancienne, riz pilaf ».

## Sous-fiches déduites des noms

Une sous-fiche est un ingrédient qui porte le nom d'une fiche. Trois fiches
portent le nom d'un produit brut et sont exclues (table `_brut`) : « Fenouil »
et « Poireau » d'avril (17 fiches utilisent « Fenouil » comme légume, dans des
fonds et des bisques), et « Chou kale » d'août quand la fiche parente est d'un
autre jour. Sans cela, la commande comptait le fenouil deux fois.

## Restent sans plat (6)

Compotée de rhubarbe, Écrasé de butternut rôtie à la sauge, Fondue de poireaux
au Gruyère d'alpage, Tartinade de champignons au thym, Pain et beurre maison :
aucune fiche ni aucun menu ne les cite. Jus de poireau brûlé : fiche d'août.

## Fichiers

- `01-apply.sql` : l'import, en une transaction, rejouable (identifiants fixes,
  `on conflict do nothing`). Contrôles avant écriture (ligne sans fiche,
  correspondance morte, rubrique inconnue) et après (empreinte des lignes
  antérieures inchangée, sinon tout est annulé).
- `02-verification.sql` : comptes et empreintes à comparer à l'essai à blanc.
  Relevé après application : identiques (`0e67c3b2…` et `97b7a308…`).
- `99-rollback.sql` : retire les plats `wl-*`, les 6 cartes et les liens du
  brunch vers les 10 desserts. Ne touche ni aux recettes ni à la carte Brunch.

Aucune sauvegarde préalable : l'import n'ajoute que des lignes, aucune ligne
existante n'est modifiée (vérifié par empreinte dans la transaction).
