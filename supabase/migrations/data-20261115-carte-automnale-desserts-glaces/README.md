# Carte Automnale Woodland : page Dessert, glaces et supplément alcool

Appliqué en prod le 15.11.2026 (essai à blanc conforme avant, puis `01-apply.sql`).
Source : la page Dessert de la carte imprimée.

## Ce qui change

- Desserts : « Assortiment de fromages » (15.-, sans fiche) et « Coupe Danemark » (15.-), rangée avec ses deux fiches neuves, « Sauce chocolat maison » et « Chantilly au siphon maison ». La glace vanille est achetée.
- Prix de la carte posés sur les quatre desserts qui n'en avaient pas (15, 16, 14, 15).
- Onglet « Glaces » : neuf glaces à 4.- la boule et « Supplément alcool » à 5.-.
- Caisse : catégorie « Glaces » après Desserts (même TVA que Desserts), bouton du supplément au taux normal fixe (8.1, même à l'emporter), réglage `supplements` dans `caisse_reglages.config`.

## Le supplément dans la caisse

Le réglage dit : `{ plat_id: 'wl-auto-supp-alcool', choix: 'Alcools', pour: ['Glaces'] }`.
La fiche de chaque produit de l'onglet Glaces propose le supplément ; ses boutons sont les produits rangés dans la catégorie de caisse « Alcools », lus en direct. Un alcool ajouté ou retiré dans cette catégorie apparaît ou disparaît sans autre réglage. Le toucher ajoute une ligne « Supplément alcool (Kirsch) » au prix du plat, que la base impose. Au 15.11.2026, aucun alcool n'est rangé dans « Alcools » au Woodland : la fiche propose alors le supplément sans choix. Code : `src/modules/caisse/supplements.js`.

## Retour arrière

`99-rollback.sql` relit les tables `sauvegarde.desserts_20261115_*`.
