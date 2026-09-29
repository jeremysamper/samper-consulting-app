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
