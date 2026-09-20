# Suite des `produitId` orphelins — les 28 lignes restées en suspens

La réparation du 11.08.2026 (`data-20260811-produitid-orphelins`) avait relié 27
lignes et refusé délibérément tout appariement non unique. 28 lignes étaient
restées orphelines, toutes sur `etab-2`, sur 13 recettes. Le README d'origine les
décrivait comme « aucun produit du catalogue ne porte ce nom avec cette unité ».
C'est exact, mais ce n'était pas la vraie cause.

## Pourquoi le nom ne correspondait pas

Au ré-import du catalogue du 20.05.2026, **le préfixe de marque et la ponctuation
ont disparu des noms de produits** :

| Nom dans la recette | Nom au catalogue aujourd'hui |
|---|---|
| Cailler Poudre de cacao | Poudre de cacao |
| JuraSel Sel de table vert, iodé et fluoré | Sel de table vert iodé et fluoré |
| Grey Poupon Moutarde forte | Moutarde forte |
| Economy Miel de fleurs liquide | Miel de fleurs liquide |
| Gelita gélatine en feuilles, argent | Gélatine en feuilles argent |
| Asperges vertes, Europe | Asperges vertes Europe |
| Quality Amandes, non émondées, moulues | Quality Amandes non émondées moulues |
| Cremo Lait entier 3,5%, UHT | Cremo Lait entier 3.5% UHT |

L'égalité stricte des noms ne pouvait donc pas aboutir. Le **prix unitaire figé
dans la recette tranche** : quand il est identique au centime près au prix du
produit candidat, l'identité ne fait pas de doute.

## Bloc A — 17 lignes certaines

Traitées par `01-reparer-liens.sql`. Nom identique une fois le préfixe de marque
et la ponctuation retirés, **et** prix figé égal au prix du catalogue.

| Ingrédient | Produit du catalogue | Prix | Lignes |
|---|---|---|---|
| JuraSel Sel de table vert, iodé et fluoré | Sel de table vert iodé et fluoré | 0.00095/g | **10** |
| Asperges vertes, Europe | Asperges vertes Europe | 0.0086/g | 1 |
| Cailler Poudre de cacao | Poudre de cacao | 0.03245/g | 1 |
| Economy Miel de fleurs liquide | Miel de fleurs liquide | 0.00709/g | 1 |
| Gelita gélatine en feuilles, argent | Gélatine en feuilles argent | 0.0338/g | 1 |
| Grey Poupon Moutarde forte | Moutarde forte | 0.00589/g | 1 |
| Quality Amandes, non émondées, moulues | Quality Amandes non émondées moulues | 0.01495/g | 1 |
| Echalotes, emballés | Echalotes, Filet 1 kg | 0.00395/g | 1 |

Le cas des échalotes mérite une note : le catalogue en porte deux, même nom et
même unité, à 0.00395/g (filet 1 kg) et 0.00067/g (sac 5 kg). C'est exactement la
situation que la règle d'origine prévoyait, et le prix figé départage sans
ambiguïté.

Répétition à blanc du 20.09.2026 sur la production, en transaction annulée :
13 recettes sauvegardées, 77 lignes comparées, **17 `produitId` réparés**, 0 unité,
0 prix, 0 quantité, 0 nom modifiés, 0 ligne perdue, 11 orphelins restants.

## Les 11 lignes qui demandent un arbitrage

### B. Estragon, 2 lignes — même produit, unité changée

Le catalogue ne propose plus l'estragon frais qu'en `pcs` (sachet 50 g à 2.99).
Or 2.99 / 50 = **0.0598**, exactement le prix figé dans les deux recettes : c'est
bien le même produit, re-référencé du gramme à la pièce.

Relier sans convertir ferait lire « 40 g » comme « 40 pièces », soit 119.60 CHF
au lieu de 2.39. Il faut donc convertir en même temps que relier :
Beurre blanc cidre estragon 40 g → 0.8 pcs, Sauce maison 6 g → 0.12 pcs. C'est la
seule exception assumée à la règle « on ne touche qu'à `produitId` », et elle
demande un accord explicite.

### C. Doublons du catalogue, 6 lignes

| Produit | Exemplaires | Lignes |
|---|---|---|
| Quality Crème entière 35% UHT | 2, strictement identiques (nom, unité, prix, conditionnement) | 2 |
| Jus de citron à base de concentré | 2, même prix, conditionnements différents (bouteille 1 L / carton 6 x 1 L) | 3 |
| Vinaigre de pomme 4,5° | 2, même prix, conditionnements différents (bouteille / pack de 3) | 1 |

Les deux exemplaires donnent le même food cost, donc le choix est sans
conséquence sur le chiffre. Le bon ordre reste de **dédupliquer le catalogue
d'abord** : relier vers un doublon qui sera supprimé ensuite recréerait un
orphelin.

### D. Écarts de prix à trancher, 2 lignes

| Ligne | Prix figé | Prix catalogue | Lecture |
|---|---|---|---|
| Cremo Lait entier (Crémeux tonka) | 0.000116/ml | 0.00139/ml | 0.116 CHF le litre est impossible : **le prix figé est faux**, relier fait remonter le vrai coût |
| Carottes Gastro (Crème de carotte) | 0.00135/g | 0.000135/g | 0.135 CHF le kilo est impossible : **le prix du catalogue est faux**, d'un facteur 10 |

Le second cas doit se corriger côté produit avant tout rattachement, sinon on
propage l'erreur dans le food cost. Même famille que
`data-20260811-prix-unit-inverses`.

### E. Produit disparu, 1 ligne

`Quality Jaune d'oeuf liquide importé, d'élevage au sol, pasteurisé` (Crémeux
tonka, 0.0122/g) n'a plus aucun équivalent au catalogue : ni « jaune », ni
« œuf », ni « liquide », ni « pasteurisé » ne rendent quoi que ce soit. Il faut
le ressaisir comme produit, ou laisser la ligne déliée avec son prix figé.

## La sauvegarde ne vit plus dans `public`

`00-sauvegarde.sql` crée sa table dans un schéma **`sauvegardes`** dédié. Seul
`public` est exposé par PostgREST, donc rien n'atterrit dans l'API. C'est la
leçon du 20.09.2026 : la sauvegarde du 11.08 était restée lisible et effaçable
par n'importe quel compte connecté, tous établissements confondus (voir
`20260920_securiser_tables_sauvegarde.sql`).

## Ordre d'exécution

1. `00-sauvegarde.sql` — snapshot des 13 recettes concernées, hors de `public`.
2. `01-reparer-liens.sql` — bloc A uniquement. Se termine par `rollback;` :
   remplacer par `commit;` après relecture.
3. `02-verification.sql` — compare avant/après ligne à ligne.

Il n'y a pas de `99-rollback.sql` : la table de sauvegarde suffit à reconstruire
l'état d'avant, et un rollback en masse écraserait les modifications faites
depuis par la brigade.
