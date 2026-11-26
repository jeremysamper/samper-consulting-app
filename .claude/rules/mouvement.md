# Mouvement

Règle durable du chantier mouvement (26.11.2026) : l'app répond au geste par un mouvement court, partout de la même façon. Le dosage est « marqué », choisi par Jérémy sur la planche de démonstration (branche `demo/planche-mouvement`, jamais fusionnée).

## Jetons
Dans `:root` d'`src/styles/app.css`, sans variante de thème :
- `--mvt-1` 140 ms (retour d'un toucher), `--mvt-2` 260 ms (changement d'état), `--mvt-3` 420 ms (ce qui entre à l'écran).
- `--courbe` (arrivée douce), `--courbe-depart` (ce qui sort), `--courbe-ressort` (arrivée avec un léger dépassement).
- `--mvt-enfonce` 0,94 (échelle la plus creuse d'un bouton), `--mvt-creux` 8 px (ce qu'un bouton perd sur son plus grand côté), `--mvt-trajet` 16 px (distance d'une entrée, d'une secousse).
Un mouvement neuf lit ces jetons, jamais une durée ni une courbe écrite en dur.

## Coupe-circuits
`prefers-reduced-motion`, la préférence de l'appareil (`data-mouvement="reduit"`) et `.pdf-render-root` mettent les jetons à zéro (section « Mouvement (socle) »). Un mouvement qui lit les jetons les suit sans une ligne de plus. Côté code, `mouvementReduit()` de `src/utils/mouvement.js`.

## Règles
- Seules la position, l'échelle et l'opacité bougent. Pas de flou, de lueur, de dégradé animé, de chiffres qui défilent, de texte qui s'écrit seul, de confettis.
- Un mouvement ne retarde jamais une écriture et ne bloque jamais un toucher : la base est appelée au geste, le mouvement l'accompagne.
- Aucun état ne dépend de la seule fin d'une animation (`finished`, `animationend`) : chaque attente porte un délai de garde (`apresDepart`). Le navigateur peut figer les images.
- Une entrée ne garde rien après sa fin : `backwards`, jamais `both` ni `forwards`. Une animation restée posée sur une transformation fait de l'élément le repère de ses enfants en position fixe (une liste déroulante ouverte dans une fenêtre partirait de travers). Seule une sortie garde son état final (`forwards`), jusqu'au retrait de l'élément.
- Un mouvement qui échoue ne casse rien : les fonctions du socle rendent `null` plutôt que de lever.
- Pas de bibliothèque d'animation : feuille de style et `element.animate`.
- Le KDS, le Spa, la FAQ et la réservation d'un soin gardent leur système.
- La durée et la fluidité se jugent sur l'appareil réel : le volet d'aperçu ne rend que quelques images par seconde.

## Outils
- Classes d'`app.css` pour ce qui vient d'être monté ou va être retiré : `.mvt-naissance`, `.mvt-depart`, `.mvt-voile`, `.mvt-voile-sort`, `.mvt-fenetre`, `.mvt-feuille`, `.mvt-feuille-sort`, `.mvt-coche` (composant `Coche` de `src/components/ui`).
- `src/utils/mouvement.js` pour ce qui se rejoue sur un élément déjà là : `jouer(el, nom)` (battement, secousse, pose, naissance, depart), `apresDepart`, `releverPlaces` et `glisserDepuis` (hook `useGlissement`), `voler`.
- Enfoncement : tout `button` et toute carte cliquable s'enfoncent par la propriété `scale` (jamais `transform`, qu'une classe ou un style en ligne peut déjà porter). `installerAppui()` mesure la profondeur à la taille du bouton. Un élément qu'on tient pour le déplacer (`touch-action: none`, `draggable`) ne s'enfonce pas. Un bouton qui écrit sa propre `transition` en ligne y ajoute `scale var(--mvt-1) var(--courbe-ressort)`, sans quoi il s'enfonce sans transition.
- Fenêtres : toute fenêtre qui porte `modal-sheet-overlay` et `modal-sheet` (ou `modal-full-overlay` et `modal-full`) entre par la feuille, sans une ligne dans le module ; au téléphone elle monte du bas. `Fenetre` de `src/components/ui` sort aussi en mouvement quand elle est fermée par son voile, sa croix ou Échap (`data-sortie`, délai borné à 200 ms) ; une fermeture décidée par l'appelant reste immédiate. Une fenêtre neuve passe par `Fenetre` ou porte ces classes.
- Messages (`notify`) : le message arrive avec le ressort, un message de réussite porte la coche qui se trace, un refus arrive en se secouant, un message qui part s'efface avant son retrait. C'est la réponse commune d'une validation : un écran n'invente pas la sienne, sauf geste nommé par le chantier (envoi en cuisine, encaissement).
- Champ refusé : un champ que le navigateur refuse à l'envoi d'un formulaire se secoue (`installerRefus()`). Un écran qui valide lui-même appelle `jouer(champ, 'secousse')`.
- Menu flottant : tout `role="menu"` s'ouvre depuis son bord haut (`mvt-menu`).
- Pilule qui glisse : `usePiluleGlissante` et un `<span class="mvt-pilule">` en premier enfant d'une rangée positionnée. La rangée porte `data-pilule` une fois la pilule posée ; la feuille retire alors l'aplat de l'élément choisi. Déjà en place dans `SegmentedTabs`, dans le menu de la coque et dans la barre de raccourcis de la tablette en paysage (la pilule s'y pose sur le cercle du module, pas sur le bouton entier).
