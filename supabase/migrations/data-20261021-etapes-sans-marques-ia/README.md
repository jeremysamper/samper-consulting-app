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

## Fichiers

- `consignes.md` : règles de style, exemple validé, contrôles.
- `gabarit-lot.sql` : le SQL d'un paquet, contrôles compris.
- `02-verification.sql` : bilan sur les 647 fiches.
- `99-rollback.sql` : annulation depuis le journal d'activité.
