# Prix des inventaires Cuisine et Boissons du Rucher : APPLIQUÉ EN PROD le 07.11.2026

Inventaire `inv-1792997751713` (Le Rucher d'Evolène, périmètre Cuisine, daté du 26.10.2026, compté du 05 au 07.11, validé le 07.11 à 18 h 16).

Demande de Jérémy : vérifier tous les prix, compléter les articles sans prix (produits maison et cakes compris) avec les prix déjà en base, sinon au mieux, pour sortir l'état d'inventaire Excel.

## Résultat

- 112 lignes sans prix complétées, 5 prix aberrants corrigés : 117 lignes touchées sur 343.
- Seuls `prixUnit`, `valeur` et `ecartValeur` changent (relu en base : 0 autre champ modifié). Valeur = stock compté x prix, comme la RPC `inventaire_modifier_ligne`.
- Valeur totale : 4 414.25 CHF avant, 6 264.39 CHF après. Plus aucune ligne à 0.
- Sauvegarde : `sauvegarde.inventaires_rucher_prix_20261107` (ligne entière avant modification, hors `public`).

## Règle de choix du prix, dans l'ordre

1. **Rucher** : prix du même produit dans les inventaires du Rucher (doublon de nom, ex. « Cannelle bâtons » = « Cannelle en bâtons », ramené au gramme).
2. **Facture** : facture Brumann du 28.07 (montant / quantité). Lecture IA douteuse, à contrôler sur la pièce.
3. **Catalogue** : prix du catalogue en base (fournisseurs Woodland), ramené à l'unité de la ligne. Copie de valeur seulement, aucun lien entre les sites.
4. **Fiche** : coût matière recalculé à la main depuis la fiche, ingrédients aux prix du Rucher, méthode de l'app (coût des ingrédients / masse des ingrédients, sans rendement).
5. **Estimé** : prix de gros suisse HT estimé, faute de toute source en base.

## Produits maison (liés à une fiche)

| Produit | Unité | Avant | Après | Source |
|---|---|---|---|---|
| Assaisonnement liquide fermenté (chutes du gravlax) | kg | 0 | 3.37 | fiche, parures à 0 |
| Chausson feuilleté à l'abricot | kg | 0 | 9.57 | fiche |
| Croustillant praliné | kg | 0 | 18.83 | fiche (gianduja estimé 25/kg, feuilletine 14/kg) |
| Eau de tomate limpide et glacée | L | 0 | 6.57 | fiche |
| Lait infusé | kg | 0 | 1.76 | fiche |
| Pâte de fruits | kg | 0 | 8.48 | fiche (purée d'abricot estimée 13/kg) |
| Peau d'omble soufflée | kg | 0 | 0.76 | fiche, peaux à 0 |
| Sel fumé d'épicéa | g | 0 | 0.0072 | fiche |
| Tartelettes fruits rouges | kg | 0 | 10.56 | fiche |
| Avocat guacamole | kg | 0.2422 | 14.80 | correction, fiche sans écrevisses (option) |
| Pesto d'orties blanchies et amande | kg | 0.5405 | 23.28 | correction, fiche |
| Siphon de burrata fumée légère | kg | 0.226 | 13.29 | correction, fiche (burrata de 250 g) |
| Tzatziki | kg | 0.8197 | 7.37 | correction, fiche |

Les quatre corrections : le coût calculé par l'app ne comptait que les ingrédients reliés à un prix (ex. guacamole sans l'avocat). Autres prix maison très bas restés tels quels car leur stock est à 0 (Œuf poché, Rillettes, Gaspacho, Tarte fine pêche, Chausson sec).

## Pièce de pâtisserie et préparations non liées à une fiche

| Produit | Unité | Après | Source |
|---|---|---|---|
| Cake chocolat | pcs | 10.70 | estimé, cake de 1 kg (quatre-quarts + chocolat + cacao) |
| Cake vanille | pcs | 7.40 | estimé, cake de 1 kg |
| Cake marbré | pcs | 8.00 | estimé, cake de 1 kg |
| Cake amandes | pcs | 9.40 | estimé, cake de 1 kg |
| Muffins myrtille | kg | 6.80 | estimé |
| Sablé orange | kg | 4.9522 | Rucher, fiche Sablés citron |
| Biscuit chocolat | kg | 7.40 | estimé |
| Granité abricot | kg | 2.3764 | Rucher, fiche Granité et consommé d'abricot |
| Consommé abricot | kg | 2.3764 | Rucher, même fiche |
| Abricot confit | kg | 2.4519 | Rucher, fiche Abricot confit |
| Sirop imbibage abricot | kg | 4.00 | estimé |
| Gel citron vert | kg | 6.00 | estimé |
| Huile verte | kg | 10.00 | estimé |
| Bolognaise | kg | 10.50 | estimé |
| Ratatouille | pcs | 5.00 | estimé (quantité 1.7 : sans doute des kg) |
| Polenta (cuite, surgelée) | kg | 2.00 | estimé |
| Confiture de lait | kg | 12.00 | estimé |

## Matières premières

Rucher : Cannelle bâtons 0.1264/g, Ravioli 12.80, Colin 10.30, Spaghetti 3.45, Fleur de sureau 10.60/L, Poudre amande blanche et grise 17.16, Poudre de noisette 27.24, Amande effilés et brutes 21.17, Glucose 5.29.

Facture Brumann : Jambon cru 15.00, Saucisse 14.20.

Catalogue : Poulet émincé 11.93, Lait de coco 4.65/L (Lait coco 1.86 la boîte de 40 cl), Pickles 6.86, Sbrinz 19.80, Truite 27.50, Banane 2.17, Curry 11.83, Paprika 15.50, Cannelle moulu 25.41, Bouillon de légume en pâte 15.13, Chapelure 5.75, Sauce soja 8.75/L, Estragon 0.0189/g, Film alimentaire 30.50, Sucre glace 3.00, Olives vertes 2.35, Olives noires 2.54, Sucre vanillé 10.20, Graine de courge 8.90, Cerneaux de noix 14.50, Graine de sésames 8.80, Cacao en poudre 32.45, Chocolat noir 17.25, Poivre noir concassé 23.25.

Estimé (CHF/kg sauf mention) : Lait soja 2.40/L, Lait d'avoine 2.60/L, Grenade 2.50/pc, Clémentine 3.50, Groseille 0.025/g, Capucine 0.28/g, Purée abricot 14.00, Purée de cassis 18.00, Pain 1.50/pc, Edamame 8.50, Potatoes 4.20, Purée épinards 0.0055/g, Viande séchée 65.00, Thaï satay 12.00, Tandoori 25.00, Cumin grains 18.00, Cumin moulu 20.00, Girofle 45.00, Muscade 45.00, Fenouil (graines) 18.00, Zaatar 30.00, Curcuma 16.00, Épicéa poudre 40.00, Poudre de poireaux 45.00, Feuille de brick 18.00, Foin 1.50, Gingembre poudre 20.00, Ail séché 0.02/g, Huile de noix 30.00/L, Huile de sésame 15.00/L, Vinaigre de riz 0.005/ml, Cardamome 0.08/g, Origan 0.02/g, Wasabi 0.06/g, Anis étoilé 0.04/g, Herbes de Provence 0.02/g, Papier cuisson 15.00/rouleau, Farine mi-blanche 1.30, Arôme vanille 40.00/L, Gomme xanthane 25.00/pot, Dattes 9.00, Graines de lin 6.00, Noix de cajou curry 28.00, Noix de cajou 25.00, Feuilletine 14.00, Pommes séchées 25.00, Bombe à graisse 8.00/pc, Pollen 0.04/g.

## Correction d'unité

Fleurs comestibles : unité passée de pcs (10.02) à g (26.10) sans conversion du prix, 7.94 CHF le gramme. Ramené à 0.794 CHF/g (barquette d'environ 10 g à 7.94).

## À reprendre par Jérémy

- Les prix estimés et les deux prix de la facture Brumann, à remplacer par les factures quand elles arrivent.
- L'inventaire Cuisine du 02.10 garde Poulet émincé à 0 (3 kg) : sa sortie sur la période est valorisée à 0 dans l'état. Non modifié, inventaire déjà clos.

## Boissons (même soir, `03-boissons.sql`)

Inventaires `inv-1792997740029` (Boissons du 26.10, validé le 02.11) et `inv-1793627029424` (Boissons du 02.11, en cours, une seule ligne comptée). Mêmes prix par nom de produit sur les deux.

- 26.10 : 106 lignes complétées, valeur 15 599.87 puis 17 813.61 CHF. 02.11 : 99 lignes complétées, valeur inchangée (229.65, rien d'autre de compté).
- Relu : 0 ligne sans prix, 0 autre champ modifié. Sauvegarde `sauvegarde.inventaires_rucher_boissons_prix_20261107`.
- Facture Fauchère (prix au carton divisé par le nombre de bouteilles) : Valais 33 cl verre 1.01, Valais PET 33 cl 1.15, Iris 1 L 3.90 (abricot, poire, pomme), Iris 25 cl 1.73 (nectar d'abricot, appliqué aux cinq Iris), Opaline 1.95 (sureau, appliqué aux quatre), Arkina 33 cl 0.99, Coca et Coca zéro 1.50, Yodeli 1.16. Facture Cuendet : Café carioca 24.20/kg.
- Rucher : chaque thé ou tisane en vrac (30 références Aux 5T) à 10.38 le paquet, prix de « Thés en vrac » de l'inventaire Cuisine.
- Catalogue : Sirop grenadine 6.20 (Morand, 1 L).
- Estimé : Arkina 1 L 1.12, Arkina 50 cl 1.10, Valais gazeuse 1 L 1.40, Alpinesse 1.60, Cola craft et zéro 1.60, Mate 1.60, Sinalco 1.25, Urban kombucha 2.20, Whitefrontier 2.20, Hydromel 11.00, Sachets de thé vides 0.06 pièce.
- Produits maison, tous à 0 en stock : Base 2.00/kg, Cordial 5.00/kg, Premix 1.50/kg, Infusion 1.00/kg (forfaits, à recalculer par fiche si un stock apparaît).

## Pièces et poids des produits maison (même soir, `04-pieces-et-poids.sql`)

Relevé par Jérémy après la première passe : des poids et des nombres de pièces qui n'ont rien à voir.

- **Financiers et madeleines** : comptés à la pièce le 02.10 (50 et 100), au kilo le 26.10 (5 et 3.5). Le prix au kilo était appliqué aux pièces le 02.10 (100 madeleines à 9.48 CHF pièce = 947.73 CHF). Le 02.10 est ramené en kg avec le poids de pièce de la fiche (financier 30.5 g, madeleine 17.4 g : 1.525 et 1.738 kg). Au 26.10, stock théorique et précédent ramenés en kg aussi.
- **Prix recalculés depuis les fiches**, ingrédients aux prix du Rucher : Financier 12.51/kg (le coût de l'app oubliait beurre noisette et pignons d'arole), Madeleine 7.33/kg, Pancake 0.108 la pièce (fiche de 30 pancakes ; l'app donnait 3.59).
- **Cakes à la pièce = un cake entier** (moule de 20 cm, environ 1 kg de pâte d'après les fiches du Rucher) : Cake citron 5.63, Carrot cake 7.03, Cake au safran et amande 12.38 (la fiche fait un seul cake ; safran compté 12 CHF le gramme). L'app donnait un prix par tranche, faux lui aussi. Les quatre cakes non liés (chocolat 10.70, amandes 9.40, marbré 8.00, vanille 7.40) étaient déjà au cake entier de 1 kg.
- **Brioche safranée** gardée à 4.37 la pièce (fiche de 2 brioches de 600 g). Si une « pièce » est une petite brioche individuelle, ce prix est trop haut : à confirmer.
- Valeurs : 02.10 de 5 368.48 à 4 017.84 CHF (l'inventaire clos du 02.10 était surévalué de 1 350.64 CHF) ; 26.10 de 6 264.39 à 6 069.91 CHF ; 07.11 (en cours) prix seulement.
- Relu : 6 lignes changées par inventaire, aucun autre champ. Sauvegarde `sauvegarde.inventaires_rucher_pieces_20261107`.

## Fichiers

- `01-maj-prix.sql` : la mise à jour Cuisine telle que jouée (empreinte md5 de la liste de prix, garde sur `updated_at`).
- `02-verification.sql` : relecture.
- `03-boissons.sql` : la mise à jour Boissons.
- `04-pieces-et-poids.sql` : pièces, poids et prix des produits maison (Cuisine 02.10, 26.10, 07.11).
- `99-rollback.sql` : remet les lignes sauvegardées (Cuisine, puis Boissons).
