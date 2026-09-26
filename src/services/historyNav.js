import { getBrowserWindow } from '../legacy/legacyApi.js';

// ─────────────────────────────────────────────────────────────────────────────
// Historique de navigation : chaque changement de module pose une entrée dans
// l'historique du navigateur. C'est ce qui donne un « retour » cohérent partout :
// bouton retour et geste système Android, glissé depuis le bord dans Safari,
// boutons latéraux de la souris, Alt+← / Alt+→ sur PC, et le glissé maison de
// l'app installée sur iPad/iPhone (EdgeSwipeBack), qui n'a aucun geste natif.
//
// L'URL n'est JAMAIS modifiée : pushState(state, '') seulement. Le lien de
// réinitialisation de mot de passe lit le hash (#access_token…), le service
// worker sert vite-index.html sur cette URL : on n'y touche pas.
//
// Deux sortes d'entrées :
//   - page  : { sc: 1, idx, page }            un module
//   - layer : { sc: 1, idx, page, layer }     un calque ouvert par-dessus le
//             module (tiroir de navigation, palette…) : « retour » le referme
//             au lieu de changer de module, comme sur une app native.
// ─────────────────────────────────────────────────────────────────────────────

let currentIdx = 0;
let currentPage = null;
let popHandler = null;
let started = false;
// Calques ouverts, du plus ancien au plus récent : { id, idx, close }.
const layers = [];
// Retours déclenchés par l'app elle-même (fermeture d'un calque au clic) dont le
// popstate n'est pas encore arrivé. Une navigation demandée pendant ce temps est
// différée, sinon le retour asynchrone dépilerait la page qu'on vient de poser.
let pendingBacks = 0;
let deferredPage = null;
const listeners = new Set();

function emit() {
  listeners.forEach((listener) => {
    try { listener(); } catch { /* un abonné ne doit pas bloquer les autres */ }
  });
}

function isOurState(state) {
  return Boolean(state && state.sc === 1 && typeof state.idx === 'number');
}

function onPopState(event) {
  const state = event.state;
  if (pendingBacks > 0) pendingBacks -= 1;
  if (!isOurState(state)) return;

  currentIdx = state.idx;

  // Referme tout calque posé au-dessus de l'entrée atteinte.
  while (layers.length && layers[layers.length - 1].idx > state.idx) {
    const layer = layers.pop();
    try { layer.close(); } catch { /* le calque a pu être démonté entre-temps */ }
  }

  if (state.page && state.page !== currentPage) {
    currentPage = state.page;
    popHandler?.(state.page);
  }

  if (pendingBacks === 0 && deferredPage) {
    const next = deferredPage;
    deferredPage = null;
    pushPage(next);
  }
  emit();
}

// À appeler une fois, avec la page initiale et le setter « sans empilement ».
// Après un rechargement, l'entrée courante garde son idx : les entrées
// précédentes de l'onglet restent atteignables par « retour ».
export function startHistory(initialPage, onPop) {
  const win = getBrowserWindow();
  popHandler = onPop;
  currentPage = initialPage;
  if (!win?.history) return () => {};
  const existing = win.history.state;
  currentIdx = isOurState(existing) ? existing.idx : 0;
  try {
    win.history.replaceState({ sc: 1, idx: currentIdx, page: initialPage }, '');
  } catch { /* historique indisponible (iframe sandbox…) : l'app marche sans */ }
  if (!started) {
    win.addEventListener('popstate', onPopState);
    started = true;
  }
  emit();
  return () => {
    win.removeEventListener('popstate', onPopState);
    started = false;
    popHandler = null;
  };
}

// Pose une entrée de page. Si un calque est au sommet (on navigue depuis le
// tiroir), l'entrée du calque est REMPLACÉE par la page : « retour » ramène
// alors au module précédent et non au tiroir déjà refermé.
export function pushPage(page) {
  const win = getBrowserWindow();
  if (!win?.history || !page) { currentPage = page; return; }
  if (pendingBacks > 0) { deferredPage = page; return; }
  const top = win.history.state;
  const topIsLayer = isOurState(top) && top.layer;
  if (!topIsLayer && page === currentPage) return;
  try {
    if (topIsLayer) {
      // Le calque est consommé par la navigation : on le retire de la pile
      // sans appeler close() (l'appelant referme lui-même son UI).
      while (layers.length && layers[layers.length - 1].idx >= top.idx) layers.pop();
      win.history.replaceState({ sc: 1, idx: top.idx, page }, '');
      currentIdx = top.idx;
    } else {
      currentIdx += 1;
      win.history.pushState({ sc: 1, idx: currentIdx, page }, '');
    }
  } catch { /* quota d'historique : on navigue quand même */ }
  currentPage = page;
  emit();
}

// Ouvre un calque « refermable par retour ». Renvoie la fonction à appeler
// quand l'UI se referme d'elle-même (✕, voile, Échap) : elle consomme l'entrée.
export function pushLayer(id, close) {
  const win = getBrowserWindow();
  if (!win?.history) return () => {};
  currentIdx += 1;
  const entry = { id, idx: currentIdx, close };
  layers.push(entry);
  try {
    win.history.pushState({ sc: 1, idx: currentIdx, page: currentPage, layer: id }, '');
  } catch { /* sans historique, le calque se ferme uniquement par l'UI */ }
  emit();
  return () => {
    const i = layers.indexOf(entry);
    if (i === -1) return; // déjà refermé par « retour » ou consommé par une navigation
    layers.splice(i, 1);
    const top = win.history.state;
    if (isOurState(top) && top.layer === id && top.idx === entry.idx) {
      pendingBacks += 1;
      win.history.back();
    }
  };
}

export function canGoBack() {
  return currentIdx > 0;
}

export function goBack() {
  const win = getBrowserWindow();
  if (!canGoBack() || !win?.history) return false;
  win.history.back();
  return true;
}

export function subscribeHistory(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
