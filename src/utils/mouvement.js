// ─────────────────────────────────────────────────────────────────────────────
// Mouvement : le socle partagé de tout ce qui bouge dans l'app.
//
// Les durées, les courbes et les ampleurs sont des jetons d'app.css (--mvt-1
// à --mvt-3, --courbe, --courbe-depart, --courbe-ressort, --mvt-enfonce,
// --mvt-trajet). Ce fichier les lit sur l'élément animé : un mouvement joué
// ici suit donc les mêmes réglages que les classes .mvt-* de la feuille.
//
// Quatre règles tenues par ce fichier :
// - seules la position, l'échelle et l'opacité bougent (aucune mise en page
//   recalculée pendant un mouvement) ;
// - un mouvement ne retarde jamais une écriture et ne bloque jamais un
//   toucher : rien ici n'est à attendre avant d'appeler la base ;
// - un mouvement qui échoue ne casse jamais l'action : chaque appel rend null
//   plutôt que de lever ;
// - animations réduites (système ou préférence de l'appareil) : rien ne joue.
//
// Aucune bibliothèque : l'API d'animation du navigateur (element.animate).
// ─────────────────────────────────────────────────────────────────────────────

// Animations réduites : la préférence du système, ou celle de l'appareil
// (Réglages > Cet appareil > Apparence, attribut data-mouvement sur <html>).
export function mouvementReduit() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return true;
  if (document.documentElement.getAttribute('data-mouvement') === 'reduit') return true;
  return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

// « 180ms » ou « 0.18s » en millisecondes.
function enMs(valeur, repli) {
  const v = String(valeur || '').trim();
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return repli;
  return v.endsWith('ms') ? n : n * 1000;
}

function enNombre(valeur, repli) {
  const n = parseFloat(String(valeur || '').trim());
  return Number.isFinite(n) ? n : repli;
}

// Les réglages du mouvement tels que l'élément les hérite (une zone de la page
// peut porter un autre dosage que le reste, la planche de démonstration le
// fait). Les replis sont les valeurs de :root.
export function reglages(el) {
  const cible = el instanceof Element ? el : document.documentElement;
  const cs = getComputedStyle(cible);
  const lire = (nom) => cs.getPropertyValue(nom);
  return {
    d1: enMs(lire('--mvt-1'), 110),
    d2: enMs(lire('--mvt-2'), 180),
    d3: enMs(lire('--mvt-3'), 260),
    courbe: lire('--courbe').trim() || 'ease-out',
    depart: lire('--courbe-depart').trim() || 'ease-in',
    ressort: lire('--courbe-ressort').trim() || 'ease-out',
    enfonce: enNombre(lire('--mvt-enfonce'), 0.98),
    trajet: enNombre(lire('--mvt-trajet'), 6),
  };
}

// Les mouvements qui se rejouent sur un élément déjà à l'écran. Chacun rend
// ses images, sa durée et sa courbe d'après les réglages de l'élément.
const CATALOGUE = {
  // Un chiffre qui vient de changer (quantité, total) : il bat une fois.
  battement: (r) => ({
    images: [{ transform: 'scale(1)' }, { transform: `scale(${1 + (1 - r.enfonce) * 3})` }, { transform: 'scale(1)' }],
    duree: r.d2 * 1.4,
    courbe: r.courbe,
  }),
  // Une saisie refusée : le champ se secoue une fois, de gauche à droite.
  secousse: (r) => ({
    images: [0, -1, 1, -0.6, 0.6, 0].map((k) => ({ transform: `translateX(${k * r.trajet}px)` })),
    duree: r.d3 * 1.2,
    courbe: 'linear',
  }),
  // Un objet posé : il arrive un peu plus grand et se cale.
  pose: (r) => ({
    images: [{ transform: `scale(${2 - r.enfonce})` }, { transform: 'scale(1)' }],
    duree: r.d2,
    courbe: r.ressort,
  }),
  // Une ligne ajoutée : elle monte en place.
  naissance: (r) => ({
    images: [{ opacity: 0, transform: `translateY(${r.trajet}px)` }, { opacity: 1, transform: 'translateY(0)' }],
    duree: r.d2,
    courbe: r.courbe,
  }),
  // Une ligne retirée : elle s'efface, et reste effacée jusqu'à son retrait
  // du DOM (sans cela elle réapparaîtrait le temps d'une image).
  depart: (r) => ({
    images: [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.98)' }],
    duree: r.d1,
    courbe: r.depart,
    garde: true,
  }),
};

// Joue un mouvement du catalogue sur un élément. Rend l'animation (sa
// promesse `finished` sert à retirer un élément après son départ), ou null
// quand rien ne joue : élément absent, navigateur sans l'API, animations
// réduites, nom inconnu.
export function jouer(el, nom) {
  if (!el || typeof el.animate !== 'function' || mouvementReduit()) return null;
  const recette = CATALOGUE[nom];
  if (!recette) return null;
  try {
    const { images, duree, courbe, garde } = recette(reglages(el));
    return el.animate(images, { duration: duree, easing: courbe, fill: garde ? 'forwards' : 'none' });
  } catch {
    return null;
  }
}

// Après un départ : appelle `suite` quand le mouvement est fini, ou tout de
// suite quand rien ne joue. À réserver au retrait d'un élément de l'écran,
// jamais à une écriture.
export function apresDepart(el, suite) {
  const animation = jouer(el, 'depart');
  if (!animation) { suite(); return; }
  // Une seule fois, et sans dépendre de la fin du mouvement : dans un onglet
  // masqué, le navigateur fige les animations et `finished` n'arrive pas.
  let fait = false;
  const finir = () => { if (fait) return; fait = true; suite(); };
  animation.finished.then(finir, finir);
  setTimeout(finir, 400);
}

// ── Enfoncement d'un bouton sous le doigt ──
// La règle d'app.css (« Affordance cliquable généralisée ») réduit le bouton
// pressé à l'échelle --mvt-appui. Elle est posée ici, au toucher, d'après la
// taille du bouton : il perd --mvt-creux pixels sur son plus grand côté, sans
// jamais descendre sous --mvt-enfonce. Une pilule de 120 px se creuse donc
// nettement, une ligne de 800 px à peine : la profondeur vue est la même, et
// la zone de clic d'un grand bouton ne recule que de quelques pixels (à la
// souris, un clic relâché hors du bouton rétréci serait perdu).
// Un élément qu'on tient pour le déplacer (touch-action: none, draggable) ne
// s'enfonce pas : il se soulève, c'est l'affaire du glisser-déposer.
// Un seul écouteur pour toute la page, passif, qui n'arrête aucun événement.
const CIBLES_APPUI = 'button, .ui-card--clickable';
let appuiInstalle = false;

export function echelleAppui({ cote, plancher, creux, tenu }) {
  if (tenu || !(cote > 0)) return 1;
  return Math.min(1, Math.max(plancher, 1 - creux / cote));
}

export function installerAppui() {
  if (appuiInstalle || typeof document === 'undefined') return;
  appuiInstalle = true;
  document.addEventListener('pointerdown', (e) => {
    try {
      const el = e.target instanceof Element ? e.target.closest(CIBLES_APPUI) : null;
      if (!el || el.disabled) return;
      const cs = getComputedStyle(el);
      const echelle = echelleAppui({
        cote: Math.max(el.offsetWidth, el.offsetHeight),
        plancher: enNombre(cs.getPropertyValue('--mvt-enfonce'), 0.94),
        creux: enNombre(cs.getPropertyValue('--mvt-creux'), 8),
        tenu: cs.touchAction === 'none' || el.draggable === true,
      });
      el.style.setProperty('--mvt-appui', String(Math.round(echelle * 1000) / 1000));
    } catch { /* un mouvement qui échoue ne casse rien */ }
  }, { capture: true, passive: true });
}

// ── Champ refusé ──
// Un champ que le navigateur refuse à l'envoi d'un formulaire (obligatoire
// resté vide, format faux) se secoue une fois. L'événement invalid ne remonte
// pas : il s'écoute en capture. Un seul écouteur pour toute la page.
let refusInstalle = false;

export function installerRefus() {
  if (refusInstalle || typeof document === 'undefined') return;
  refusInstalle = true;
  document.addEventListener('invalid', (e) => { jouer(e.target, 'secousse'); }, true);
}

// ── Glissement des voisins (liste qui se réordonne, ligne ajoutée ou retirée) ──
// Avant le changement : relever la place de chaque enfant du conteneur. Après
// (dans un effet de mise en page) : chaque enfant resté glisse de son ancienne
// place à la nouvelle, un enfant neuf naît. offsetLeft et offsetTop donnent la
// place de mise en page, sans la transformation d'un mouvement encore en cours.
export function releverPlaces(conteneur) {
  const places = new Map();
  if (!conteneur) return places;
  for (const el of conteneur.children) places.set(el, { x: el.offsetLeft, y: el.offsetTop });
  return places;
}

export function glisserDepuis(conteneur, places) {
  if (!conteneur || !places || mouvementReduit()) return;
  let r;
  try { r = reglages(conteneur); } catch { return; }
  for (const el of conteneur.children) {
    if (typeof el.animate !== 'function') continue;
    const avant = places.get(el);
    if (!avant) { jouer(el, 'naissance'); continue; }
    const dx = avant.x - el.offsetLeft;
    const dy = avant.y - el.offsetTop;
    if (!dx && !dy) continue;
    try {
      el.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
        { duration: r.d2, easing: r.courbe }
      );
    } catch { /* un mouvement qui échoue ne casse rien */ }
  }
}

// ── Vol d'une pastille d'un point à un autre (article touché vers le ticket) ──
// `depuis` est un rectangle relevé au moment du toucher, `vers` l'élément
// d'arrivée. La pastille vit sur le corps de la page, sans rien recevoir, et
// se retire seule. Elle n'est lue ni par un lecteur d'écran ni par le
// traducteur.
export function voler(depuis, vers) {
  if (!depuis || !vers || mouvementReduit() || typeof document === 'undefined') return null;
  try {
    const r = reglages(vers);
    const arrivee = vers.getBoundingClientRect();
    const x0 = depuis.left + depuis.width / 2;
    const y0 = depuis.top + depuis.height / 2;
    const x1 = arrivee.left + Math.min(arrivee.width / 2, 24);
    const y1 = arrivee.top + arrivee.height / 2;
    const pastille = document.createElement('span');
    pastille.className = 'mvt-vol';
    pastille.setAttribute('aria-hidden', 'true');
    pastille.setAttribute('data-no-translate', '');
    document.body.appendChild(pastille);
    const animation = pastille.animate(
      [
        { transform: `translate(${x0}px, ${y0}px) scale(1)`, opacity: 0.9 },
        { transform: `translate(${x1}px, ${y1}px) scale(0.5)`, opacity: 0.9, offset: 0.85 },
        { transform: `translate(${x1}px, ${y1}px) scale(0.2)`, opacity: 0 },
      ],
      { duration: r.d3 * 1.3, easing: r.courbe, fill: 'forwards' }
    );
    const retirer = () => pastille.remove();
    animation.finished.then(retirer, retirer);
    return animation;
  } catch {
    return null;
  }
}
