# 06.08.2026 · Quantités des recettes, Le Rucher d'Évolène et Woodland Village

Mise à jour **de données**, pas de schéma. Sous-dossier de `migrations/` pour
que la CLI Supabase ne le rejoue pas, même convention que
`data-20260801-produits-carte-ete-woodland/`.

**Déjà appliqué en production le 06.08.2026.** Ces fichiers sont la trace et le
retour arrière, pas une tâche en attente.

## Périmètre

320 recettes lues, sur `etab-1777157340476` (Le Rucher) et `etab-2` (Woodland).
Deux corrections sans rapport l'une avec l'autre :

- **Unités** : 255 lignes d'ingrédients passées de `g` à `ml`, valeur
  identique. 133 au Rucher, qui n'en comptait aucune alors que sa carte porte
  dix boissons ; 122 à Woodland, qui en avait déjà 49.
- **Portions** : 40 recettes recalculées (6 contre leur fiche source, 20
  préparations de batch coincées à « 1 portion », 14 cordials).

Le nombre total de lignes d'ingrédients est inchangé après coup, 711 et 1151 :
aucune ligne perdue.

## Unités · pourquoi seulement une partie des liquides

Le classement se fait sur la **tête du nom**, avant la parenthèse de composant.
Une règle par mot-clé sur le nom entier faisait passer pour des liquides
« Thé vert Longjing » (feuilles sèches), « Sucre (crème) », « Jaunes (crème) »
et « Grains de kéfir d'eau », où la parenthèse ne dit pas la matière mais la
préparation à laquelle la ligne appartient.

Les **liquides denses restent en grammes** : sirop, miel, huile, cordial, lait
concentré. À 1,25 de densité, 30 g de sirop font 23 ml ; convertir à valeur
égale aurait faussé les fiches. Les passer en ml demande de convertir aussi les
valeurs, ce qui est une autre opération.

`prixUnit` est en CHF par unité et n'a pas été touché : coût matière et food
cost sont inchangés par la partie unités.

## Portions · d'où viennent les nombres

**Six écarts sont sourcés**, relus dans les classeurs d'origine (1141 fichiers
indexés, 501 recettes retrouvées par leur nom) : Falafel 20 → 60, Houmous
20 → 50, Tzatziki 20 → 50, Meringue italienne 300 → 40, Jus léger de volaille
35 → 10, Sirop d'imbibage 30 → 12. Les valeurs fausses portent la signature du
bug d'import corrigé le même jour (`c009e97`) : le poids du rendement lu comme
un nombre de portions, « 300 g, environ 40 pièces » donnant 300.

**Les vingt autres viennent des doses de service** données par Jérémy : verre
20 cl, sauce et vinaigrette 50 g, croûtons 35 g. Pour les boissons, le diviseur
est le volume **buvable** et non le poids brut : feuilles de thé, achillée et
grains de kéfir sont infusés puis retirés, sucres et sirops restent dans la
bouteille. Deux rendements tiennent compte d'une perte ou d'un gain à la
cuisson, et c'est signalé ligne à ligne dans `02-apply-portions.sql` :
croûtons 40 et non 51 (le pain sèche), mousseline 13 (les haricots secs
triplent).

**Les cordials** étaient à 120 portions pour des lots de 1,2 à 1,5 kg, soit
10 g par verre. La dose est de 4 cl, ce qui pour un cordial à 1,25 fait 50 g,
exactement ce que le Premix prélève. Ils passent à 24-31 doses.

## Ce qui n'a pas été touché, volontairement

**Les 15 « Premix » du Rucher restent à 1 portion.** Ce sont des verres montés
— 50 g de cordial, 120 ml d'eau pétillante, 120 g de glaçons, 40 g d'alcool en
version cave — et non des productions. Leur « 1 » est la bonne valeur ; les
corriger aurait cassé le coût par verre. Ne pas les inclure dans une future
passe sur les recettes à une portion.

## Reste ouvert

Dix recettes dont la portion pèse moins de 5 g : Sablé 750 portions pour 553 g,
Mélange de graines torréfiées 800 pour 906 g, Gel passion coco 540, Meringue
400, Tomates confites 300, Glaze teriyaki 280. Même signature que le bug
d'import. Corriger demande le poids unitaire de chaque pièce, il n'est nulle
part en base.

## Retour arrière

`99-rollback-quantites.sql` remet les unités et les portions d'avant. Il
commence par une requête de contrôle qui doit renvoyer **255** ; un écart
signifie que les fiches ont bougé depuis et qu'il faut repartir de la
sauvegarde complète plutôt que du script.

Cette sauvegarde est l'état exact des 320 recettes avant l'opération, portions
et ingrédients :
`Documents\App-Web\_sauvegardes-supabase\recettes-rucher-woodland-avant-20260806.json`.
Hors dépôt exprès, c'est de la donnée client.
