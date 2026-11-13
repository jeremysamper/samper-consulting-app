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
- Cartes de mise en avant : `--carte-nuit` (avec `--carte-nuit-texte`, `--carte-nuit-doux`, `--carte-nuit-tuile`), `--carte-soleil` et `--carte-ciel` (avec leur `-texte`). Par écran : au plus une carte nuit et deux cartes pastel. Elles portent un résumé ou des chiffres, jamais un état.
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

## Primitives
Elles portent la direction à la source : passer par `src/components/ui/` plutôt que redessiner un bouton, un champ, une carte ou une ligne.
- `Card`, exportée aussi sous le nom `Panneau` : la carte blanche, limite visible d'un groupe (`data-cadre`). Aucun module ne redessine la sienne.
- `CarteAvant` (tons `nuit`, `soleil`, `ciel`) et `carteAvantStyles(ton)` pour ses pièces (titre, libellé, chiffre, tuile intérieure). `KpiCard` : carte blanche, picto dans un cercle (`pictoCercleStyle()`), libellé, grand chiffre.
- `ligneStyle()` : le style partagé d'une ligne de liste (filet bas, hauteur de l'échelle ; `serree` pour 44 px).
- `Btn` : une pilule ; `primary` pour l'action principale, `ghost` pour le secondaire. `Input`, `SectionHeader`, `SegmentedTabs` (rangée de pilules, la choisie en aplat sombre).
- `Fenetre` et les styles `st` de `Fenetres.jsx` (`titre`, `label`, `champ`, `primaire`, `secondaire`, `choix`) pour une fenêtre et son formulaire.
- Tuile d'accueil (`accueil-tuile`, `AccueilModule`) : carte blanche, picto dans un cercle `--piste` (`.accueil-tuile-picto`).
- Un contour s'écrit en `borderWidth`, `borderStyle` et `borderColor`, jamais par le raccourci `border` quand un état en change la couleur (`npm.cmd run lint:borders`).
- Un état que le style en ligne ne sait pas dire (survol, focus, éteint) vit dans `app.css`, accroché à une classe ou à la valeur écrite en ligne. L'anneau de focus reste visible sur l'aplat sombre : posé hors de la pilule, ou dans la pilule à l'encre du texte.
- Un bloc qui doit garder son cadre porte `data-cadre` ; sans lui, la règle « Plus de carrés » d'`app.css` l'aplatit sur la page.

## Béquilles
La section « Direction Galet (béquilles) », en fin d'`app.css`, rattrape les styles en ligne d'avant : taille sous 12 px, graisse 700, rayons numériques (par famille : bouton et étiquette en pilule, champ et image en `--r`, fenêtre en `--r-xl`), accent en texte, contour des champs. Elle ne s'applique pas dans une vue capturée en PDF. Un module repris écrit ses valeurs à la source ; une béquille tombe quand plus aucun élément ne l'atteint (preuve par grep sur `src/` et par le banc). La classe `ui-btn--ghost` reste forcée par la règle des boutons secondaires tant que des boutons écrits à la main la portent (modules de l'hôtel).
