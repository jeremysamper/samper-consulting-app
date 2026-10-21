# Woodland Village, lignes des menus de groupe reliées à leur plat, 21.10.2026

**État : appliqué en prod le 21.10.2026 vers 7 h 20 (heure de Zurich), hors
service**, avec `_decision` = `dedoubler`. Feu vert de Jérémy : « applique le
platid des menus, dédouble la tartelette ». Vérifié par empreinte après
application (section Empreintes).

## Pourquoi

Le module Groupes calcule la liste de courses et le croisement des allergènes
d'un groupe à partir de la liaison de chaque ligne de menu choisie :
`fichesDe` (`src/modules/groupes/listeCourses.js`) prend les `recetteIds` de
la ligne, sinon les fiches du plat `platId`. Avant ce lot, 4 lignes sur 459
avaient un `platId` (aucune n'a de `recetteIds`) : le reste s'imprimait sur
les menus, mais sortait en « à commander à la main » et « allergènes non
vérifiés ».

Les plats existent depuis le matin même (`data-20261021-plats-cartes-woodland`,
un plat `wl-ev-<fiche>` par fiche de dressage, avec toute sa chaîne de
sous-fiches). Ce lot ne fait que pointer les lignes vers eux.

## Ce que fait 01-apply.sql

Table `groupe_menus`, `etablissement_id = 'etab-2'`, colonne `lignes` (14
menus). Seul le champ `platId` de chaque ligne change :

- La correspondance ligne > fiche de dressage est celle du 21.10, reprise
  telle quelle (fonction `pg_temp.nk`, tables `_r`, `_l`, `_lc`, `_ovr`, `_m`,
  `_reuse`), recopiée par script depuis
  `data-20261021-plats-cartes-woodland/01-apply.sql`. Le plat d'une ligne est
  `wl-ev-<fiche>`, sauf la fondue moitié-moitié qui garde son plat
  `2ba8817a…` (déjà relié à 3 lignes, inchangées).
- **Paris-Brest** (`mariage-0-ga-15`, compléments mariage, gâteaux) : passe du
  plat d'avril `d5aef48a…` (« Paris-Brest » de la Carte Printemps, 3 fiches
  pour 4 portions) au plat `wl-ev-rec-1792178957969-68472` (« Paris-Brest au
  praliné noisette », fiches événements du 16.10, pour 40). C'est la seule
  liaison existante que le script a le droit de remplacer (table `_remplace`) ;
  toute autre liaison existante différente arrête le script.
- **Saisons.** Une ligne sans saison vaut pour l'été et l'hiver. Sur les 66
  lignes sans saison (toutes dans les compléments mariage), 65 visent le même
  plat dans les deux saisons. Une seule vise deux fiches : « Mini tartelette
  de saison » (`mariage-0-mi-05`, mignardises), fiches « …, été » (abricots,
  pistaches) et « …, hiver » (fruits d'hiver caramélisés, noisettes), mêmes
  allergènes. Le plateau de fromages « confiture de saison » et la compotée
  « crumble au sarrasin » ont déjà une ligne par saison dans leurs menus.

### La décision de saison (table `_decision`)

`platId` est unique par ligne et l'écran ne sait pas lire un plat par saison.
Choix possibles pour `mariage-0-mi-05` :

| Choix | Effet | Liste de courses |
|---|---|---|
| `dedoubler` (proposé) | la ligne devient la ligne d'été (`saison: 'ete'`, plat été), une copie `mariage-0-mi-05-hiver` (`saison: 'hiver'`, plat hiver) est ajoutée juste après | juste en toute saison |
| `ete` ou `hiver` | un seul plat toute l'année | fausse la moitié de l'année (abricots en hiver ou fruits d'hiver en été) |
| `aucun` | la ligne reste sans plat | « à commander à la main », comme aujourd'hui |

Le dédoublement reprend ce que font déjà les menus séminaires 2 et 3 pour le
même libellé (une ligne été, une ligne hiver). Aucun groupe n'a de choix
enregistré (un seul événement Woodland, `choix` vide) : aucun choix ne pointe
vers la ligne.

## Essai à blanc (21.10.2026 vers 6 h, heure de Zurich)

Application, puis retour arrière dans la même transaction, puis
`raise exception` (rien d'enregistré) : texte de `01-apply.sql` jusqu'au
résumé, `discard temp`, texte de `99-rollback.sql`, exception qui rend les deux
résumés. Avec `dedoubler` :

| | Avant | Après |
|---|---|---|
| Menus modifiés | | 14 |
| Lignes | 459 | 460 (la copie d'hiver) |
| Lignes reliées | 4 | 460, aucune sans plat |
| Plats distincts visés | | 262 |
| Plats sans fiche chiffrable (portions) | | 0 |

Contrôles en fin de transaction, tous vrais : colonnes des menus hors lignes
inchangées, chaque ligne hors `platId` inchangée (hors `saison` pour la ligne
dédoublée), copie identique à l'original hors `id`, `saison` et `platId`,
autres établissements inchangés, liaisons écrites égales au plan ligne à
ligne. Retour arrière dans la même transaction : 459 lignes, 4 reliées,
empreinte complète identique à l'état d'avant.

Contrôle avant écriture, en plus de ceux du 21.10 : chaque plat visé existe
dans etab-2, est actif et porte la fiche de sa ligne.

## Empreintes (`02-verification.sql`)

| Empreinte | Avant (relevé) | Attendu (essai à blanc) | Après application (relevé) |
|---|---|---|---|
| `empreinte_liaisons` | `b1ba00b1bd5285d85ba44a1108457ee4` | `4acdc1a7d580ca85272a39ca508b8d22` | `4acdc1a7d580ca85272a39ca508b8d22` |
| `empreinte_lignes_hors_platid` | `86f3cc63c1ee345b291e51b51a0e0d4d` | identique | `86f3cc63c1ee345b291e51b51a0e0d4d` |
| `empreinte_menus_hors_lignes` | `5c0b7b7de21d9d74f4666973dcbe9138` | identique | `5c0b7b7de21d9d74f4666973dcbe9138` |
| `empreinte_lignes_completes` | `c509b5f1c8225baa65fc979f148dd814` | (change) | `7e120b308c320c49593ed266228ebc99` |

Relevé de l'application (résumé de `01-apply.sql`, identique à l'essai à
blanc) : 14 menus modifiés, 459 > 460 lignes, 4 > 460 reliées, aucune sans
plat, 262 plats, Paris-Brest remplacé, tartelette dédoublée,
`existant_inchange` et `liaisons_attendues` vrais. `02-verification.sql`
lancé ensuite hors transaction : 460 lignes, 460 reliées, aucun plat
introuvable, aucune fiche sans portions, tartelette été et hiver chacune sur
son plat, Paris-Brest sur `wl-ev-rec-1792178957969-68472`.

Une empreinte `empreinte_liaisons` différente de `4acdc1a7…` signale une
liaison changée depuis (à la main dans l'écran, ou par un menu enregistré
depuis un éditeur resté ouvert) : voir « Annuler ».

## Sauvegarde

`00-sauvegarde.sql` : les 14 lignes de `groupe_menus` d'etab-2, complètes, dans
`App-Web/_sauvegardes-supabase/groupe-menus-woodland-avant-platid-20261021.json`
(hors dépôt). Transport en base64, décodé par Node : md5 du fichier
`144d6b86c16fdbe03e5d88718f2a53d3`, identique au md5 calculé par le serveur ;
14 menus, 459 lignes ; empreinte des lignes `c509b5f1…`, la même que
`02-verification.sql` avant application.

## Annuler

1. `99-rollback.sql`, avec le même choix dans `_decision` qu'à l'application.
   Il recalcule la même correspondance et remet chaque ligne dans l'état
   d'avant (`platId` null, sauf les trois fondues et le Paris-Brest d'avril),
   retire la copie `mariage-0-mi-05-hiver` et rend la ligne d'origine sans
   saison. Une ligne reliée à la main depuis l'application n'est pas touchée et
   sort dans `laissees_telles_quelles`. `empreinte_lignes_completes` doit
   valoir `c509b5f1c8225baa65fc979f148dd814` (vrai à l'essai à blanc).
2. En dernier recours, la sauvegarde JSON : remettre la colonne `lignes` de
   chaque menu depuis le fichier.

## Limite connue côté écran

L'écran « Plats à relier » et l'enregistrement d'un menu reportent une liaison
à **toutes** les lignes de même libellé, quelle que soit leur saison
(`propagerLiaison`, clé `cleLibelle`). Relier à la main « Mini tartelette de
saison », « Compotée de fruits de saison, crumble au sarrasin » ou « Plateau
de fromages … confiture de saison » écraserait la liaison de l'autre saison.
Rien ne se passe tant qu'on ne relie pas ces plats à la main ; la correction
(clé libellé + saison) relève du front : commit `63ee4e0` sur la branche
`claude/zen-hodgkin-6e4081`, pas encore poussé ni fusionné au 21.10.2026.

Pendant l'application, un menu ouvert dans l'éditeur avant l'écriture et
enregistré après réécrirait ses lignes sans les liaisons : appliquer hors
service, puis relancer `02-verification.sql`.
