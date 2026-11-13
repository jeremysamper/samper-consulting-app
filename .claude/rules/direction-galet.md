---
paths:
  - "src/**/*.jsx"
  - "src/**/*.js"
  - "src/**/*.css"
---

# Direction Galet

Direction d'apparence de l'app depuis le 13.11.2026 (elle remplace la direction Office) : fond de page gris froid, cartes blanches à grand rayon et ombre douce, boutons et onglets en pilules, aplat sombre pour l'action principale et pour l'élément choisi, cartes de mise en avant, chiffres grands en graisse normale. Les polices ne changent pas. Les valeurs sont dans `src/styles/app.css` (bloc `:root` et les deux blocs sombres, identiques entre eux). « Galet » est un nom de travail : il ne s'affiche nulle part. Tout écran neuf naît dans cette direction.

## Échelle
- Tailles de texte : `--t1` 12 px, `--t2` 14, `--t3` 17, `--t4` 20, `--t5` 24, `--t6` 29. Rien sous 12 px.
- Graisses : `--g1` 400, `--g2` 500, `--g3` 600. Jamais 700 ni plus. Titre de page ou d'écran en `--g2`, titre de carte en `--g3`. Chiffre mis en avant : `--font-num`, graisse `--g-chiffre` (400), taille `--t5` ou `--t6`, zéro simple, avec son libellé en `--t1` ou `--t2` et `--text3`.
- Rayons : `--r-sm` 10 px (case, pastille carrée), `--r` 14 px (champ, tuile intérieure, ligne en bouton, menu flottant), `--r-lg` 20 px (carte, tuile d'accueil), `--r-xl` 24 px (fenêtre, carte de mise en avant), `--r-full` (bouton, onglet, étiquette). Une pilule ne tient que sur une ligne : un bouton en bloc (tuile, ligne de liste, bouton à plusieurs lignes) prend `--r` ou `--r-lg`.
- Hauteurs : contrôle `--controle` (40 px), cible de 44 px au doigt, ligne de liste `--ligne-aeree` (48 px) là où les gestes de l'écran tiennent aux trois postes, `--ligne` (44 px) sinon. Un bouton à picto seul est un cercle de 40 px dans une cible de 44 px.
- Marge de page : `--marge` (24 px, 32 px dès 768 px de large). Elle est lue par la coque seule (`AppLayout.jsx`), jamais par un module.

## Jetons par rôle
- Fond de page `--bg` ; carte, champ, fenêtre : `--surface` (`--zone` pour une carte). `--surface2` vaut la surface : jamais pour dire un état.
- Carte : fond `--zone`, rayon `--r-lg`, ombre `--sh`, filet `--rule-soft` d'un pixel (il porte la carte en thème sombre). Entre deux cartes : 24 px, 16 px au téléphone si les gestes le demandent.
- Action principale : fond `--accent`, texte `--on-accent`. Bouton secondaire : `--btn-fond`, `--btn-texte`, contour `--btn-bord`.
- Ce qui est choisi. Une pilule choisie (onglet, filtre, puce, créneau, entrée de menu) est un aplat sombre : fond `--accent`, texte `--on-accent`. Une ligne choisie dans une liste et un survol sont en `--selection`, avec `--text`. L'aplat sombre dit l'action principale et le choix en cours ; il ne sert jamais de décor.
- Champ : contour `--champ-bord`, fond `--surface`, rayon `--r`. Un bord d'état (quantité comptée, erreur) garde sa couleur.
- Groupe de pilules, tuile intérieure, cercle d'un picto : `--piste`.
- Cartes de mise en avant : `--carte-nuit` (avec `--carte-nuit-texte`, `--carte-nuit-doux`, `--carte-nuit-tuile`, et `--carte-nuit-succes`, `-info`, `-alerte`, `-danger` pour un trait de graphique), `--carte-soleil` et `--carte-ciel` (avec leur `-texte`). Par écran : au plus une carte nuit et deux cartes pastel. Elles portent un résumé ou des chiffres, jamais un état. En thème sombre, la carte nuit est une teinte pétrole plus claire que les cartes, et ses tuiles sont plus sombres qu'elle : elle se détache du fond sans changer de rôle.
- Ombres : `--sh` pour une carte, `--sh-lg` pour ce qui flotte (fenêtre, menu, tiroir). Aucune autre ombre.
- Marqueur du jour et repères au trait : `--onglet`. Texte qui portait l'accent : `--lien` ou `--text`.
- Toast ou bandeau sombre : `--toast-fond` et `--toast-texte` ; le statut est porté par le picto (`--toast-succes`, `--toast-danger`, `--toast-alerte`).
- Statuts, services, caisse, IA : leurs jetons d'avant (`--success-*`, `--danger-*`, `--warning-*`, `--info-*`, `--svc-*`, `--caisse-*`, `--ai-*`). Un statut se dit par un point de couleur et un texte lisible, ou par ses jetons de fond et d'encre. Un marqueur d'état peut changer de couleur, il ne disparaît pas.

## Interdits
- Lire `--nav*` hors de la coque (`src/layouts/AppLayout.jsx`, `src/components/nav/`, règles `.sc-nav-*` et `.nav-organizer*`). `--nav-active` et `--nav-text-active` sont l'aplat et l'encre de l'entrée choisie du menu : ils ne servent ni au survol ni au texte courant. Un texte blanc littéral sur `--nav` est refusé par `npm.cmd run lint:on-color`.
- Couleur en dur, `gradient(`, `blur(`, `text-shadow`, `uppercase`, `backdrop-filter` autre que `none`, halo coloré, émoji. Une ombre écrite autrement que par `--sh` ou `--sh-lg`.
- Une règle globale qui reprend une couleur ne vise que la valeur neutre nommée (`--border`, `--border2`), jamais tout élément qui porte la propriété.
- Un jeton de couleur nouveau sans son miroir dans `THEME_VAR_OVERRIDES` (`src/design/brandTokens.js`), ou sans ses deux valeurs sombres identiques.
- Appliquer la direction dans une vue capturée en PDF : `.pdf-render-root` garde les rayons de 8 px et les couleurs de marque, un export sort identique au pixel.
- Restyler le Spa, le KDS, la FAQ ou `src/reservation/`, qui gardent leur système.

## Coque
- Menu de l'ordinateur : un rail d'icônes de 76 px par défaut (un cercle de 44 px par module sur `--surface`, l'entrée choisie en aplat `--nav-active`, le libellé gardé pour le lecteur d'écran et en infobulle). Le bouton placé à gauche du titre le déplie en menu à libellés de 234 px, Ctrl ou Cmd + B aussi ; le choix est gardé sur le poste dans `sc_menu_deplie` (`'1'` déplié), que ce bouton seul écrit. La coque pose `--largeur-menu` (76 ou 234 px) : ce qui est fixe en bas d'écran s'y cale.
- Barre du haut : à gauche le bouton du menu, le titre de la page et l'établissement en pilule ; à droite la recherche en pilule (`.app-bar-recherche`, « Aller à un module » et son raccourci, repliée en cercle sous 1180 px), puis la langue, le thème, la messagerie et les alertes en cercles de 40 px dans une cible de 44 px (`.app-bar-btn`), puis le compte : pastille, nom et rôle (`.app-bar-compte-nom`, masqué sous 1280 px). Le pied du menu ne porte que les réglages.
- Tablette et téléphone : la coque tactile garde son accueil en tuiles et sa barre ; elle n'a pas de rail.
- Le rail demande de lire une infobulle pour nommer un module : c'est le seul geste que la composition ajoute, il s'efface en dépliant le menu une fois.

## Composition d'un écran
Le tableau de bord (`src/modules/dashboard/`) est l'écran de référence ; un écran recomposé reprend sa grammaire.
- Le titre de l'écran est posé sur la page, en grand (`--t6`, `--g2`), sans carte autour.
- Une rangée de repères : de petites cartes blanches (`CarteRepere`), trois de front, le picto dans son cercle, le chiffre, sa phrase, un détail. Le picto se retire quand la carte devient étroite.
- Au plus une carte nuit à tuiles (`CarteAvant ton="nuit"`, tuiles de `carteAvantStyles('nuit').tuile`, un `Anneau` par tuile) et deux cartes pastel, chacune avec un graphique simple (`Barres`, `Arc`). Un `BoutonFleche` en haut à droite d'une carte mène au module, pour le rôle qui peut l'ouvrir.
- Les listes sont des cartes blanches (`Panneau`), leurs lignes séparées par un filet `--rule-soft`.
- Un graphique est muet : le nombre se dit par un texte posé à côté, dans son nœud `data-no-translate`. Une carte ne lit que des données déjà chargées par l'écran et n'en invente aucune ; sans donnée, elle n'est pas rendue.
- La mise en page suit la largeur du conteneur de l'écran (requêtes de conteneur), jamais celle de la fenêtre : le rail et le menu déplié ne donnent pas la même place. Paliers du tableau de bord : 560, 760, 1080 et 1240 px. Entre 760 et 1079 px, la carte nuit reste à côté de la liste et les deux pastel passent côte à côte dessous.
- Au téléphone, les trois cartes s'empilent et allongent la page d'un écran environ : à peser écran par écran avant de les reprendre.

### Écran d'un module
Six règles tirées du lot 2 (HACCP, commande, pertes, mise en place), dont les écrans servent d'exemple (`haccp.css`, `commande.css`, `pertes.css`, `mep.css`).
- Ordre d'un accueil : à l'ordinateur, repères puis carte nuit et tuiles côte à côte ; au téléphone et à la tablette étroite, l'entrée de la tâche principale et les tuiles d'abord, les repères ensuite.
- Au téléphone, les repères qui répètent la carte nuit ne sont pas rendus ; il en reste deux au plus, sur une ligne.
- Sur une carte nuit, l'action principale s'écrit à l'encre inversée : fond `--carte-nuit-texte`, texte `--carte-nuit`. Un bouton secondaire y est une pilule au contour `--carte-nuit-doux`.
- Une barre d'avancement devient un `Anneau` quand elle dit une part faite ; son compte reste écrit à côté.
- Un écran recomposé pose sa grille sur un enfant de son conteneur de requêtes (`.x-page` porte `container-type`, `.x-grille` porte la grille) : une requête de conteneur ne règle pas le conteneur lui-même. Le conteneur ne contient aucune fenêtre du module en position fixe.
- Dans une zone capturée en PDF, rien ne change en style en ligne. Une carte s'y écrit par une classe de la feuille du module, exclue de la capture (`:not(.pdf-render-root *)`). Aucun `div` n'est ajouté comme enfant direct de la zone (la feuille d'export lui donne une marge) : une enveloppe s'écrit en `section`, ou hors de la zone. L'export se prouve joué avant et après, par empreinte de bande.

## Tableau de bord en widgets
Depuis le lot W (14.11.2026), le tableau de bord est une grille de widgets que chacun compose, comme l'écran d'accueil d'un téléphone : ajouter, retirer, déplacer, changer de taille. La disposition suit la personne d'un appareil à l'autre.
- Registre : `widgets/catalogue.js` décrit chaque widget sans JSX (id, nom, description, famille, `page` ouverte au toucher, tailles, taille d'origine par poste, garde `visible(ctx)`) ; `widgets/registre.js` y ajoute picto et composant (`widgets/Widgets.jsx`). `TableauDeBord.jsx` ne nomme aucune carte : il lit les données, pose les gardes d'avant dans `ctx` et rend la grille. Un widget neuf entre par le catalogue, avec un test dans `widgets/dispositionLogique.test.mjs`.
- Modèle : une liste ordonnée `{ id, taille }` par poste (ordinateur, tablette, téléphone), sans position libre. Grille de `tableau.css` : deux colonnes au téléphone et sous 760 px de conteneur, quatre au-dessus, `grid-auto-flow: row dense`, rangée minimale de 148 px au téléphone et de 132 px ailleurs, que le contenu fait grandir. Tailles : petit 1 sur 1, moyen 2 sur 1, grand 2 sur 2, pleine largeur à la hauteur du contenu.
- Un widget ne défile jamais et ne coupe aucun texte de donnée : une liste borne ses lignes selon sa taille et finit par « Voir tout » vers le module (ou par le dépli d'avant, « Voir N autres points »). Un toucher hors de ses boutons ouvre sa `page` pour qui y a droit.
- Disposition d'origine : `origine(poste, ctx)`, fonction pure, les cartes d'aujourd'hui dans le même ordre de lecture, au plus une carte nuit et deux pastel ; au téléphone, une seule carte de mise en avant et aucun repère qui la répète. Un groupe de petits widgets remplit ses rangées (`taillesDeGroupe`) : un trou serait comblé par un widget venu de plus bas. Elle n'allonge aucune page (B6, mesuré au banc).
- Données : un widget ne lit rien de plus que le tableau de bord ; les lectures restent décidées par les gardes, jamais par la disposition. Une garde fermée cache le widget, qui garde sa place dans la liste. Un widget dont la donnée n'est pas lue ne se fait pas : il s'écrit au rapport du lot, avec la lecture qu'il demanderait.
- Stockage : clé `tdb_disposition` de `user_settings` (`{ v: 1, ordinateur, tablette, telephone, raccourcis }`), lue dans le cache du pont dès qu'il est prêt ; copie locale `sc_tdb_disposition`, qui porte l'identifiant de la personne (appareil partagé). Lecture prudente par `normaliser` (inconnu, doublon et taille non permise retirés ou ramenés, valeur illisible : l'origine). Écriture en échec : `notify`, la disposition reste à l'écran et sur le poste, marquée en attente. Rien ici ne bloque un pointage.
- Mode « Personnaliser » : poignée (glisser en Pointer Events, flèches au clavier), flèches, tailles en pilules, « Retirer » ; contenu inerte ; « Ajouter un widget » ouvre la galerie, rangée par famille ; rien n'est gardé avant « Terminé » ; le geste retour et Échap demandent s'il y a des changements. Un nom accessible composé (« Déplacer » et le nom du widget) passe par `aria-labelledby` sur deux nœuds traduits, jamais par une chaîne assemblée qui partirait au traducteur.
- Un module qui pourrait offrir un widget le décrit au rapport de son lot (donnée avec fichier et ligne, garde, tailles, lecture à ajouter) ; il n'écrit pas dans `src/modules/dashboard/`.

## Primitives
Elles portent la direction à la source : passer par `src/components/ui/` plutôt que redessiner un bouton, un champ, une carte ou une ligne.
- `Card`, exportée aussi sous le nom `Panneau` : la carte blanche, limite visible d'un groupe (`data-cadre`). Aucun module ne redessine la sienne.
- `CarteAvant` (tons `nuit`, `soleil`, `ciel`) et `carteAvantStyles(ton)` pour ses pièces (titre, libellé, chiffre, tuile intérieure). `KpiCard` : carte blanche, picto dans un cercle (`pictoCercleStyle()`), libellé au-dessus, grand chiffre dessous.
- `CarteRepere` : la petite carte blanche d'une rangée de repères, le chiffre d'abord puis sa phrase (`Icone`, `valeur`, `libelle`, `detail`, `texte` quand il n'y a pas de chiffre à dire, `onClick` pour en faire un bouton). Son retrait vient de la classe `ui-repere` d'`app.css` : un écran le règle par largeur de conteneur.
- `BoutonFleche` (`onClick`, `libelle`, `ton`) : le bouton rond de 44 px en haut à droite d'une carte ; sans `onClick`, il n'est pas rendu.
- Graphiques de `Graphiques.jsx`, exportés par `index.jsx` : `Anneau` (`part` de 0 à 1, `couleur`, `piste`), `Barres` (`valeurs`, `libelles`, `fort`, `encre`, `encreForte`), `Arc` (`parts` : `[{ valeur, couleur }]`, `total`, `piste`, et en enfant ce qui s'inscrit au pied de l'arc). Leurs couleurs sont des jetons passés par l'appelant ; sur une carte de mise en avant, l'encre est celle de la carte. Aucun module n'importe une pièce depuis `src/modules/dashboard/`.
- `ligneStyle()` : le style partagé d'une ligne de liste (filet bas, hauteur de l'échelle ; `serree` pour 44 px).
- `Btn` : une pilule ; `primary` pour l'action principale, `ghost` pour le secondaire. `Input`, `SectionHeader`, `SegmentedTabs` (rangée de pilules, la choisie en aplat sombre).
- `Fenetre` et les styles `st` de `Fenetres.jsx` (`titre`, `label`, `champ`, `primaire`, `secondaire`, `choix`) pour une fenêtre et son formulaire.
- Tuile d'accueil (`accueil-tuile`, `AccueilModule`) : carte blanche, picto dans un cercle `--piste` (`.accueil-tuile-picto`).
- Un contour s'écrit en `borderWidth`, `borderStyle` et `borderColor`, jamais par le raccourci `border` quand un état en change la couleur (`npm.cmd run lint:borders`).
- Un état que le style en ligne ne sait pas dire (survol, focus, éteint) vit dans `app.css`, accroché à une classe ou à la valeur écrite en ligne. L'anneau de focus reste visible sur l'aplat sombre : posé hors de la pilule, ou dans la pilule à l'encre du texte.
- Un bloc qui doit garder son cadre porte `data-cadre` ; sans lui, la règle « Plus de carrés » d'`app.css` l'aplatit sur la page.

## Béquilles
La section « Direction Galet (béquilles) », en fin d'`app.css`, rattrape les styles en ligne d'avant : taille sous 12 px, graisse 700, rayons numériques (par famille : bouton et étiquette en pilule, champ et image en `--r`, fenêtre en `--r-xl`), accent en texte, contour des champs. Elle ne s'applique pas dans une vue capturée en PDF. Un module repris écrit ses valeurs à la source ; une béquille tombe quand plus aucun élément ne l'atteint (preuve par grep sur `src/` et par le banc). La classe `ui-btn--ghost` reste forcée par la règle des boutons secondaires tant que des boutons écrits à la main la portent (modules de l'hôtel). En fin de feuille, deux béquilles de contraste remontent au seuil de lecture l'encre d'un élément éteint par une opacité en ligne (0,6 sur le fond de page, 0,5 sur la surface sombre) : un élément éteint reste lisible à 4,5 ; on ne descend pas sous 0,65 sur le fond de page.
