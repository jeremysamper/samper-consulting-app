# Jouanet : audit visuel du 19.11.2026

Objectif : un visuel agréable et pas trop agressif, avec des dégradés légers là où ils servent.
Compte consultant, Woodland Village, production (main 0938efd), puis la branche `style/degrades-legers` sur un serveur local.
Thème sombre (celui de Jérémy) et thème clair (celui des appareils réglés sur « système » en journée), écran 1366 x 900 et téléphone 375 x 812.
Écrans relevés : tableau de bord, Réservations, Groupes, Caisse, HACCP, Réglages. Mesures dans la page : aplats par surface, saturation, contrastes WCAG.

## Résumé

Le visuel est déjà calme dans l'ensemble. Ce qui agresse vient de quelques endroits précis :

1. **En clair, la carte nuit est un bloc presque noir** au milieu de cartes blanches.
2. **Les couleurs des services (midi, soir) sont très vives** dans les graphiques en clair.
3. **En sombre, les cartes se détachent à peine du fond**, tout est au même niveau.
4. **Le rouge sert à des états qui ne sont pas des dangers** (groupe « À lire », bouton de déconnexion).

| Gravité | Nombre | Traité dans la branche |
|---|---|---|
| Majeur | 4 | 1 corrigé, 2 adoucis |
| Note | 4 | 0 |

## Constats

### V1 | Majeur | Clair, tableau de bord, HACCP, Inventaire, Planning
**La carte nuit est un bloc presque noir sur une page claire.**
Elle attire l'œil avant tout le reste, même quand elle ne dit rien d'urgent.

```
Carte nuit #06222d sur le fond de page #e8ebee : 13,8:1
Cartes blanches #ffffff sur le même fond     :  1,2:1
Surface de l'écran du tableau de bord        : 14 %
HACCP au téléphone : la carte occupe le haut de l'écran, au-dessus des quatre tuiles
```

**Fait :** dégradé pétrole de `#0f4256` (haut gauche) à `#06222d`. Le texte garde 10,9:1 au point le plus clair (libellés doux 5,7:1).

### V2 | Majeur | Clair, tableau de bord (Réservations), Statistiques
**Les couleurs des services sont vives et complémentaires, côte à côte.**
L'arc des réservations met un orange brique et un bleu roi saturés dans une carte pastel.

```
--svc-midi #b93c0a  et  --svc-soir #1e40af  (clair)
En sombre, les mêmes jetons sont déjà adoucis : oklch(80 % 0,12 55) et oklch(81 % 0,085 250)
```

**Non fait :** ces jetons colorent aussi les textes et les en-têtes de Réservations, où leur contraste sert la lecture (5,7:1 et 8,7:1 sur blanc). Proposé : deux jetons de graphique adoucis (`--svc-midi-graphe`, `--svc-soir-graphe`) pour les arcs et les barres seulement.

### V3 | Majeur | Sombre, partout
**Les cartes se détachent à peine du fond de page.**
L'œil n'a pas de point d'appui : l'écran se lit comme un seul bloc sombre.

```
Carte #11252e sur fond #071319 : 1,2:1
Carte nuit #17404f sur fond    : 1,7:1
```

**Adouci :** lueur pétrole très légère en haut de page et dégradé des cartes de mise en avant. Proposé ensuite : un filet de carte un cran plus clair (`--rule-soft`) ou une surface de carte légèrement relevée en sombre.

### V4 | Majeur | Sombre, tableau de bord, Achats, Pertes
**La carte soleil devient kaki en sombre.**
Les barres crème vives sur une teinte terne donnent une impression boueuse.

```
Carte soleil sombre #3a3216, barres et texte #f3e7b5 : 8,2:1 au point le plus clair du dégradé
```

**Adouci :** dégradé de `#4a411f` à `#3a3216`. Proposé ensuite : une teinte plus chaude (ambre doux) pour cette carte en sombre.

### Notes

- **N1, Groupes :** un groupe passé « À lire » est peint en rouge dans le calendrier (case bordeaux en sombre, rose en clair) et « À lire » s'écrit en rouge au tableau de bord. Le rouge annonce un danger ; ici c'est une lecture à faire. Proposé : couleur d'information, le rouge seulement à J-2 non lu.
- **N2, Groupes :** le bandeau « À anticiper » en ambre sur ambre prend toute la largeur ; en sombre, c'est le bloc le plus vif de l'écran. Proposé : bandeau neutre avec une pastille ambre.
- **N3, Réglages > Mon compte :** « Se déconnecter » est un bouton rouge pleine largeur. Proposé : bouton secondaire, le rouge gardé pour la suppression.
- **N4, contrastes extrêmes :** texte principal à 15,8:1 en sombre et 18,4:1 en clair. Ce n'est pas un défaut WCAG ; un texte presque blanc sur fond très sombre peut « briller ». Rien à faire maintenant.

## Ce qui a été fait (branche `style/degrades-legers`)

- **Fond de page (`--ambient`, lu par `body`)** : deux lueurs très légères en haut de page. En clair, le sable de la marque à gauche et l'aqua à droite ; en sombre, le pétrole à droite et un soupçon de sable à gauche. Tailles en `vw` et `vh` : elles ne s'étirent pas avec la longueur de la page.
- **Cartes de mise en avant (`--degrade-nuit`, `--degrade-soleil`, `--degrade-ciel`)** : un seul sens (135 deg), un ton plus clair en haut à gauche, arrivée sur la teinte de la carte. Posé une fois dans `CarteAvant` et `carteAvantStyles` : les cartes du tableau de bord, du HACCP, du Planning, de l'Inventaire, des Achats, des Pertes et des Points suivent.
- **Contrastes au point le plus clair** : nuit 10,9 en clair et 8,7 en sombre (libellés doux 5,7 et 5,2), soleil 13,5 et 8,2, ciel 13,2 et 8,3.
- **Exports** : `THEME_VAR_OVERRIDES` rend les trois dégradés en aplat de marque ; un PDF capturé reste plat.
- **Règle** : `.claude/rules/direction-galet.md` gagne une section « Dégradés légers » (deux familles de jetons, et elles seules ; jamais sur un texte, un bouton, une pastille, un statut, une ligne ni une carte blanche).
- **Pas touché** : boutons, textes, statuts, listes, cartes blanches, Spa, KDS, exports.

## Ce qui marche

- Aucun aplat saturé (saturation de 0,45 ou plus) ne couvre plus de 0,4 % de l'écran du tableau de bord, en clair comme en sombre.
- Six à sept couleurs d'aplat par écran, toutes issues des jetons.
- Échelle de texte tenue : 12 à 29 px, graisse 600 au plus, 16 à 26 % des textes en 600.
- Aucun texte sous le contraste WCAG 1.4.3 sur le tableau de bord (150 textes mesurés, audit UX du même jour).

## Par où continuer

1. V2 : jetons de graphique adoucis pour midi et soir. Faible effort.
2. N1 et N3 : rouge réservé au danger (groupe « À lire », déconnexion). Faible effort.
3. V3 : relief des cartes en sombre (filet ou surface). Effort moyen, à regarder sur écran.
4. V4 : teinte de la carte soleil en sombre. Faible effort, à regarder sur écran.
5. N2 : bandeau d'anticipation des Groupes neutre. Faible effort.
