# 29.09.2026 : durées de vie (DLC) de la Carte Automnale, Woodland Village

Mise à jour **de données**, pas de schéma. Sous-dossier de `migrations/` pour
que la CLI Supabase ne le rejoue pas, même convention que
`data-20260731-dlc-woodland-village/`.

**Déjà appliqué en production le 29.09.2026** (78 lignes, recomptées après
écriture). Ces fichiers sont la trace et le retour arrière, pas une tâche en
attente.

## Périmètre

91 fiches recette rattachées à la carte `carte-1787604411839-oe3j`
(« Carte Automnale », établissement `etab-2`), aucune partagée avec une autre
carte. Avant l'opération, toutes étaient aux valeurs par défaut de la
migration (3 j au froid, non congelables), sauf la crème légère de panais
(3 j, 90 j surgelé).

78 fiches modifiées. Les 13 autres sont des assiettes dressées à la minute
(burger, coupe du chasseur, tataki dressé, sanglier confit à l'assiette...) :
elles ne passent jamais par une étiquette et restent à 3 j.

## Barème retenu

Demande de Jérémy : « au maximum possible », avec le plafond de 7 j du barème
confirmé. Chaque fiche monte donc au plus haut de sa classe :

- **3 j** : cru, laitier frais, œuf, produit de la mer, découpe fraîche
- **5 j** : cuit ou stabilisé (fonds, jus, légumes rôtis, mayonnaises)
- **7 j** : très stabilisé (pickles, condiments acides, sirops, secs, confit)

La fiche prime quand elle est plus stricte : chou kale 4 j, sauce au vieux
fromage 3 j, œufs parfaits 3 j, chips de lard sec 3 j, espuma de foin 1 j
(« ne se conserve pas »), carpaccios et salade d'automne 1 j (tenue 24 h),
planchette 1 j (tranchée le jour même).

Quand la fiche annonce plus de 7 j (pickles 2 mois, condiments 15 j à 1 mois,
betteraves 10 j, caramel 1 mois), l'étiquette porte 7 j : c'est la DLC
entamé, comme sur l'Estivale.

`duree_vie_congele_jours` reprend la durée écrite sur la fiche (3 mois = 90,
2 mois = 60) et reste `NULL` quand la fiche interdit la congélation (gels
agar, émulsions, chou rouge mariné, poires au vin, viandes à fondue...).
`duree_vie_decongele_jours` est inchangé (2 j). La colonne `congelable`
(qualification MEP) n'est pas touchée.

## Choix à relire

- **Entrecôte parée, médaillons de cerf** : la fiche dit 5 j, le barème classe
  la découpe crue à 3 j. Posé à 3 j, non congelable (la fiche n'en parle pas).
- **Crème de raifort** : fiche 4 j, crème crue infusée, posée à 3 j.
- **Émulsion d'échalote au vin rouge** : la fiche dit 21 j alors qu'elle
  contient la mayonnaise que ses propres fiches limitent à 5 j. Posée à 5 j.
- **Condiment d'airelles** : fiche muette sur la congélation, 180 j comme les
  fruits au sucre de l'Estivale.

## Retour arrière

`99-rollback-dlc.sql` remet les 78 fiches dans leur état d'avant. Même état
exporté hors dépôt dans
`App-Web/_sauvegardes-supabase/dlc-carte-automnale-woodland-avant-20260929.json`.

## Seconde passe, 29.09.2026 : au maximum (`02-apply-dlc-max.sql`)

Demande de Jérémy après la première passe : lever le plafond de 7 j. Il fixe
lui-même la mayonnaise industrielle à 21 j et le poulpe cuit sous vide à 21 j,
et demande le plus de produits possible à 7 j au frais, surgélation au maximum.

- **21 j** : poulpe cuit sous vide, mayonnaises à base industrielle (ail noir,
  chili crisp, paprika fumé), émulsion d'échalote.
- **Durée de la fiche au-delà de 7 j** : pickles 60 j, condiments et
  vinaigrette 15 à 30 j, betteraves 10 j, caramel et poires au vin 30 j.
- **7 j** : tout ce qui est cuit et conditionné sous vide (fonds, jus,
  braisés, légumes rôtis, purées, volaille SV), pièces de viande crue sous
  vide (entrecôte, cerf), crémeux myrtille.
- **Secs** : 14 j (sablé, croustillant, croûtons), 30 j (fruits secs
  torréfiés, poudre de sapin), 90 j (assaisonnement), poudre de caramel 7 j.
- **Surgélation** : 180 j pour fonds, jus, braisés, viandes, légumes rôtis ;
  120 j volaille cuite ; 90 j pour crème, pâtes, crémeux, purées.

Laissés sous 7 j, volontairement : viandes à fondue 3 j (tranches fines),
chevreuil tataki 5 j (cœur cru), pigeon 4 j (filets crus), sauce au vieux
fromage 5 j, crème de raifort 4 j, chou kale 4 j, orge perlé et riz au lait
5 j (céréale cuite), tagliolini 5 j et cromesquis 3 j (œuf cru), namelaka 5 j
(crème crue), œufs parfaits 3 j (fiche), mayonnaise aux herbes fraîches 7 j,
huile de sapin 7 j (végétal frais dans l'huile), espuma et assiettes 24 h 1 j.

Pendant l'opération, la « Vinaigrette au miel de montagne » a été supprimée
et remplacée par une nouvelle fiche « Vinaigrette balsamique miel »
(`rec-1790685028251`, brouillon, émulsion sans œuf) : passée de 7 à 15 j.

Retour à la première passe : rejouer `01-apply-dlc.sql`. Retour à l'origine :
`99-rollback-dlc.sql`.

## Troisième passe, 29.09.2026 : décongélation au maximum (`03-apply-decongele-max.sql`)

41 fiches congelables, toutes à 2 j avant. Décongelée, une fiche garde sa
durée au frais, plafonnée à 7 j : 32 fiches à 7 j, namelaka et orge perlé à
5 j. Crus ou fragiles au dégel à 3 j : entrecôte, cerf, chevreuil tataki,
pigeon, carpaccio de poulpe pressé, pâte à tagliolini, cromesquis.
