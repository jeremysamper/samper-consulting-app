# Étapes des fiches de groupe sans marques d'écriture IA, 21.10.2026

Demande de Jérémy : retirer des fiches qui composent les menus de groupe
(Groupes, Mariages, Séminaires) les marques d'écriture IA. Il s'agit des
phrases à rallonge, des explications en fin de phrase, des nombres écrits en
lettres et des « soit ». Périmètre : les 647 fiches de Woodland Village
(`etab-2`) créées le 16.10.2026. Seule la colonne `etapes` change.

Style validé par Jérémy sur un exemple avant/après : voir `consignes.md`.

## Résultat (relevé par 02-verification.sql)

- 647 fiches réécrites, chacune une seule fois.
- Il reste 0 étape « Vigilance », 0 point-virgule, 0 tiret long, 0 point
  médian, 0 « soit », 0 « ce qui », « afin de » ou « pour que », 0 « moins 18 »
  ou « pour cent », et 0 étape de plus de 280 caractères.
- Le texte passe de 834 610 à 749 245 caractères.

## Méthode

Écriture par paquets de 20 fiches au plus, avec `gabarit-lot.sql`. Le
gabarit refuse le paquet entier, sans rien écrire, si une fiche perd un
nombre de l'original, perd le nom d'une fiche citée, garde une tournure
interdite, s'allonge ou a changé en base depuis sa lecture. Après écriture,
dans la même transaction, il vérifie que le journal d'activité a gardé
l'ancienne version de chaque fiche.

Les lots 1 à 8 (rangs 1 à 647 par id) ont été réécrits par des agents en
parallèle. Le Mode ÉCO ajouté le même matin à CLAUDE.md limite à un agent ;
Jérémy a choisi de laisser finir ceux déjà lancés. Les rangs 61 à 81 et la
fiche Fraisier ont été faits dans la session principale.

Corrections du gabarit en cours de route :
- un nombre converti depuis des lettres porte une marque (§) pour ne plus
  fusionner avec le nombre suivant. Le Fraisier (« couper en deux 400 g ») était
  lu « 2 400 » et bloqué à tort ;
- les classes de caractères sont écrites en échappements (`\u2014`, `\u00a0`),
  pas en clair.

Faux positifs connus, sans effet sur ce qui est écrit (le contrôle refuse,
il ne laisse jamais passer) : « soit » au subjonctif, « pour que » dans « pour
quelques », « au moins 12 » lu comme « moins 12 ». Les agents ont reformulé
(« jusqu'à eau claire », « 12 heures minimum »).

## Points laissés tels quels

- Terrine du boucher : « cuire 6 à 3 jours avant », écrit ainsi à l'origine.
- Deux fiches écrivent « 1 heure » au lieu de « une heure » (Rillettes de
  cochon, Figues pochées au Pinot noir).
- Quand un nombre n'existait que dans une explication, il a été gardé en
  phrase courte (« Un sorbet arrosé fond en 2 minutes »).

## Sauvegarde et annulation

Pas d'export local : le journal d'activité garde pour chaque fiche l'ancienne
et la nouvelle version des étapes (`journal_activite.avant` et `apres`, 647
lignes du 21.10.2026 sans acteur, module recettes). Le gabarit a contrôlé
cette sauvegarde fiche par fiche avant chaque validation. Ces 647 lignes
apparaissent dans le Journal d'activité de l'app, sans nom d'auteur.

`99-rollback.sql` remet les anciennes étapes depuis le journal. Une fiche
retouchée depuis dans l'app n'est pas touchée : le script la liste.

## Deuxième passe : les fiches plus anciennes des mêmes cartes

À la relecture, Jérémy a relevé que les cartes Brunch, Groupes, Mariages et
Séminaires comptent aussi 98 fiches créées avant le 16.10 : le brunch de juin,
les desserts des cartes restaurant et des sous-fiches d'août. Elles portaient
les mêmes marques, surtout dans les notes (`notes_consultant`) : « zéro stress
le jour même », « la préparation d'avance par excellence », « se congèle deux
mois ». Les étapes avaient aussi des « ≈ », des listes en « + », des
majuscules (« REPOS OBLIGATOIRE ») et des parenthèses explicatives.

- 81 fiches réécrites (étapes et/ou notes) avec `gabarit-fiche.sql`, qui
  reprend les contrôles du premier gabarit pour les deux champs. Les
  caractères interdits y sont écrits par `chr()`. Les bornes de mot évitent
  les refus injustifiés (« sauce qui », « pour quelques », « au moins 12 »).
- Les accents ont été remis dans les fiches Brownie et Cinnamon rolls
  Woodland.
- Les 17 autres fiches étaient déjà propres et n'ont pas été touchées : les
  fiches d'avril (« Accompagne : … »), les pancakes, la confiture de lait, la
  meringue, l'assaisonnement et plusieurs sous-fiches d'août.
- Vérification finale sur les 740 fiches des 7 cartes : 0 point-virgule,
  tiret long, point médian, flèche ou « ≈ ». 0 « vigilance », 0 « soit », 0
  explication en fin de phrase, 0 mot en majuscules, 0 nombre en lettres
  hors noms de fiches citées (« en deux textures »).
- Annulation : `99-rollback-passe-2.sql`, depuis le journal d'activité.

## Fichiers

- `consignes.md` : règles de style, exemple validé, contrôles.
- `gabarit-lot.sql` : le SQL d'un paquet, contrôles compris.
- `02-verification.sql` : bilan sur les 647 fiches.
- `99-rollback.sql` : annulation depuis le journal d'activité.
- `gabarit-fiche.sql` : deuxième passe, étapes et notes d'une fiche.
- `99-rollback-passe-2.sql` : annulation de la deuxième passe.
