// ════════════════════════════════════════════════════════════════
// Moteur de traduction à la volée du DOM (mode « Original » / « English »).
//
// Principe, identique aux widgets de traduction des sites web : on ne réécrit
// AUCUN module. Le moteur traduit le DOM rendu et se remet à jour à chaque
// re-rendu React via un MutationObserver.
//
// Trois niveaux, du moins cher au plus cher :
//   1. glossaire statique  → instantané, hors-ligne, gratuit (voir glossary.js)
//   2. cache localStorage  → instantané, hors-ligne, gratuit (déjà traduit ici)
//   3. edge function IA    → une seule fois par phrase, puis mis en cache
//
// FLUIDITÉ - deux règles qui gouvernent tout ce fichier :
//
//   · INCRÉMENTAL. On ne retraverse jamais le document entier après le premier
//     passage : on ne traite QUE les sous-arbres signalés par le
//     MutationObserver. Une v1 rescannait tout le DOM à chaque re-rendu, ce qui
//     rendait l'app perceptiblement moins fluide en usage normal.
//
//   · AVANT PEINTURE. Tout ce que le glossaire ou le cache savent déjà traduire
//     est écrit SYNCHRONEMENT dans le callback du MutationObserver, qui est une
//     microtâche : le navigateur n'a pas encore peint. L'utilisateur ne voit
//     donc jamais le français pour du contenu déjà connu - plus de clignotement.
//     Seul l'appel IA (contenu jamais rencontré) reste différé, par nature.
//
// GARDE-FOUS (aucune donnée métier ne doit pouvoir être corrompue) :
//   · on n'écrit JAMAIS dans la value d'un input/textarea/select : seul le
//     texte affiché et quelques attributs d'affichage sont touchés ;
//   · le texte français d'origine est conservé et restauré à l'identique au
//     retour en mode Original ;
//   · les PDF générés en vectoriel (fiche recette, étiquettes DLC, MEP,
//     commande) partent des données, pas du DOM : ils restent en français.
// ════════════════════════════════════════════════════════════════
import { DO_NOT_TRANSLATE, lookupGlossary } from './glossary.js';
import { fetchSharedTranslations, pushSharedTranslations, translateTexts } from '../services/translationService.js';

const CACHE_KEY = 'sc_i18n_en_v1';
const SYNC_KEY = 'sc_i18n_sync_';       // + id d'établissement
const CACHE_MAX = 5000;      // entrées conservées en localStorage
const BATCH_SIZE = 40;       // phrases par appel IA
const MAX_BATCHES = 10;      // plafond par passe → 400 phrases max
const FETCH_DELAY = 120;     // ms de regroupement avant l'appel IA

// Sous-arbres entièrement ignorés : ni texte, ni attributs. Les élaguer au
// niveau du TreeWalker évite de remonter la chaîne des ancêtres pour chaque
// nœud texte, ce qui était l'autre coût caché de la v1.
const PRUNE_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'KBD', 'SAMP',
  'CANVAS', 'SVG', 'IFRAME', 'OBJECT', 'EMBED', 'VIDEO', 'AUDIO', 'MATH',
]);

// TEXTAREA n'est PAS élagué : son placeholder est de l'affichage et mérite
// d'être traduit. En revanche son nœud texte EST sa valeur (donnée saisie) et
// ne doit jamais être touché - c'est un enfant direct, donc un test O(1).
const VALUE_AS_TEXT = 'TEXTAREA';

// Attributs d'affichage traduits (jamais « value » : ce serait de la donnée).
const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
const ATTR_SELECTOR = '[placeholder],[title],[aria-label],[alt]';

// ── État ──────────────────────────────────────────────────────────
const memCache = new Map();                 // 'Supprimer' → 'Delete'
const originals = new WeakMap();            // nœud texte  → source française
const written = new WeakMap();              // nœud texte  → dernière valeur écrite par nous
const attrState = new WeakMap();            // élément     → Map(attr → { src, out })
let touchedNodes = new Set();               // nœuds texte à restaurer
let touchedAttrs = new Set();               // éléments à restaurer

// Cibles dont la traduction n'est pas encore connue : réappliquées telles
// quelles quand l'IA répond, sans retraverser quoi que ce soit.
let deferredTexts = [];
let deferredAttrs = [];
const pendingStrings = new Set();

let currentLang = 'fr';
let observer = null;
let fetchTimer = null;
let busy = 0;                               // requêtes IA en vol
let failures = 0;                           // échecs consécutifs (mode hors-ligne)
let mutedUntil = 0;                         // pause après échecs répétés
let degraded = false;                       // service IA injoignable → glossaire seul
let etabId = null;                          // établissement courant (scope du cache partagé)
let sharedLoaded = false;                   // cache partagé déjà rapatrié pour cet établissement
const listeners = new Set();

// ── Cache persistant ──────────────────────────────────────────────
function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw);
    for (const [fr, en] of Object.entries(obj || {})) {
      if (typeof en === 'string') memCache.set(fr, en);
    }
  } catch {
    // Cache illisible ou quota : on repart d'un cache vide, sans casser l'app.
  }
}

let saveTimer = null;
function saveCacheSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      // On borne la taille : les entrées les plus anciennes sautent en premier.
      const entries = [...memCache.entries()];
      const kept = entries.length > CACHE_MAX ? entries.slice(-CACHE_MAX) : entries;
      localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(kept)));
    } catch {
      // Quota dépassé : le cache mémoire suffit pour la session en cours.
    }
  }, 1000);
}

// ── Cache partagé (Supabase) ──────────────────────────────────────
/**
 * Rapatrie une fois par établissement le travail déjà fait par la brigade.
 * C'est ce qui évite que chaque téléphone repaie la même première passe :
 * une phrase traduite par un collègue arrive ici sans appel IA.
 *
 * Synchro incrémentale : on ne redemande que ce qui a été ajouté depuis le
 * dernier import de CET appareil.
 */
async function ensureSharedCache() {
  if (sharedLoaded || !etabId) return;
  sharedLoaded = true;   // une seule tentative par établissement et par session

  const key = SYNC_KEY + etabId;
  try {
    const since = localStorage.getItem(key) || null;
    const { pairs, latest } = await fetchSharedTranslations(etabId, since);
    for (const [fr, en] of pairs) {
      if (!memCache.has(fr)) memCache.set(fr, en);
    }
    if (latest) {
      try { localStorage.setItem(key, latest); } catch { /* quota : on resyncera */ }
    }
    if (pairs.length) saveCacheSoon();
  } catch {
    // Base injoignable (hors ligne, RLS, table absente) : on continue sur le
    // cache local. La traduction ne doit jamais dépendre de cette optimisation.
  }
}

// ── Éligibilité ───────────────────────────────────────────────────
const WORDISH = /[\p{L}\p{N}]/u;
const URL_LIKE = /^(https?:\/\/|www\.|[\w.+-]+@[\w-]+\.)/i;
const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

/**
 * Découpe « 🗑 Supprimer… » en { pre:'🗑 ', core:'Supprimer', post:'…' }.
 *
 * Isoler le cœur de la chaîne fait que « Supprimer », « 🗑 Supprimer » et
 * « Supprimer… » partagent la même entrée de glossaire et de cache : une seule
 * traduction au lieu de trois. Balayage linéaire volontaire - une version regex
 * backtrackait en O(n²) sur les textes longs (étapes de recette, notes).
 */
function splitAffixes(text) {
  let start = 0;
  let end = text.length;
  while (start < end && !WORDISH.test(text[start])) start += 1;
  while (end > start && !WORDISH.test(text[end - 1])) end -= 1;
  return { pre: text.slice(0, start), core: text.slice(start, end), post: text.slice(end) };
}

/** Le cœur de chaîne mérite-t-il une traduction ? */
function isTranslatable(core) {
  if (!core || core.length > 600) return false;
  if (DO_NOT_TRANSLATE.has(core)) return false;
  if (URL_LIKE.test(core) || UUID_LIKE.test(core) || ISO_DATE.test(core)) return false;
  // Au moins 3 lettres : écarte « 12 g », « 3 kg », « 18:30 », « CHF 4.50 ».
  const letters = core.replace(/[^\p{L}]/gu, '');
  if (letters.length < 3) return false;
  return true;
}

/** Cet élément porte-t-il un opt-out explicite ? */
function isOptOutEl(el) {
  if (!el.hasAttribute) return false;
  if (el.hasAttribute('data-no-translate')) return true;
  if (el.getAttribute('translate') === 'no') return true;
  return !!(el.classList && el.classList.contains('notranslate'));
}

/**
 * Un ancêtre interdit-il la traduction ? Appelé UNE fois par racine de
 * mutation (pas par nœud) : à l'intérieur, le TreeWalker élague tout seul.
 */
function hasForbiddenAncestor(node) {
  let el = node.nodeType === 1 ? node.parentElement : node.parentElement;
  while (el) {
    const tag = el.tagName ? el.tagName.toUpperCase() : '';
    if (PRUNE_TAGS.has(tag)) return true;
    if (isOptOutEl(el)) return true;
    el = el.parentElement;
  }
  return false;
}

// ── Collecte incrémentale ─────────────────────────────────────────
function pushAttrs(el, attrs) {
  for (const attr of ATTRS) {
    if (el.hasAttribute(attr)) attrs.push([el, attr]);
  }
}

/**
 * Collecte les cibles d'un sous-arbre. Les sous-arbres interdits sont élagués
 * par FILTER_REJECT, qui saute la descendance d'un coup.
 */
function collectTargets(root, texts, attrs) {
  if (!root || (root.nodeType !== 1 && root.nodeType !== 3)) return;
  if (hasForbiddenAncestor(root)) return;

  if (root.nodeType === 3) {
    const parent = root.parentElement;
    if (!parent || parent.tagName !== VALUE_AS_TEXT) texts.push(root);
    return;
  }

  const tag = root.tagName ? root.tagName.toUpperCase() : '';
  if (isOptOutEl(root)) return;
  if (PRUNE_TAGS.has(tag)) return;
  pushAttrs(root, attrs);

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (node.nodeType === 1) {
          const t = node.tagName ? node.tagName.toUpperCase() : '';
          if (PRUNE_TAGS.has(t) || isOptOutEl(node)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const p = node.parentElement;
        if (p && p.tagName === VALUE_AS_TEXT) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    },
  );

  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === 1) pushAttrs(n, attrs);
    else texts.push(n);
  }
}

// ── Résolution / écriture ─────────────────────────────────────────
/** Traduction connue (glossaire puis cache), ou null s'il faut appeler l'IA. */
function resolve(core) {
  const fromGlossary = lookupGlossary(core);
  if (fromGlossary) return fromGlossary;
  const cached = memCache.get(core);
  return cached === undefined ? null : cached;
}

function writeTextNode(node, value) {
  written.set(node, value);
  node.nodeValue = value;
  touchedNodes.add(node);
}

function writeAttr(el, attr, value) {
  let map = attrState.get(el);
  if (!map) { map = new Map(); attrState.set(el, map); }
  const entry = map.get(attr) || {};
  entry.out = value;
  map.set(attr, entry);
  el.setAttribute(attr, value);
  touchedAttrs.add(el);
}

/**
 * Traduit les cibles fournies avec ce qui est déjà connu. Synchrone.
 * Les cibles inconnues sont mises de côté pour l'appel IA.
 * @returns {boolean} true si au moins une chaîne manque.
 */
function applyTargets(texts, attrs) {
  let anyMissing = false;

  for (const node of texts) {
    if (!node.isConnected) continue;
    const value = node.nodeValue;
    if (written.get(node) === value) continue;   // notre écriture, intacte
    const { pre, core, post } = splitAffixes(value);
    if (!isTranslatable(core)) continue;

    originals.set(node, value);
    const en = resolve(core);
    if (en === null) {
      pendingStrings.add(core);
      deferredTexts.push(node);
      anyMissing = true;
    } else if (en !== core) {
      writeTextNode(node, pre + en + post);
    }
  }

  for (const pair of attrs) {
    const el = pair[0];
    const attr = pair[1];
    if (!el.isConnected || !el.hasAttribute(attr)) continue;
    const value = el.getAttribute(attr);
    let map = attrState.get(el);
    const entry = map && map.get(attr);
    if (entry && entry.out === value) continue;   // notre écriture, intacte
    const { pre, core, post } = splitAffixes(value);
    if (!isTranslatable(core)) continue;

    if (!map) { map = new Map(); attrState.set(el, map); }
    map.set(attr, { src: value, out: undefined });
    const en = resolve(core);
    if (en === null) {
      pendingStrings.add(core);
      deferredAttrs.push(pair);
      anyMissing = true;
    } else if (en !== core) {
      writeAttr(el, attr, pre + en + post);
    }
  }

  return anyMissing;
}

/** Passe complète : uniquement au basculement en English. */
function fullSweep() {
  if (typeof document === 'undefined' || !document.body) return false;
  const texts = [];
  const attrs = [];
  collectTargets(document.body, texts, attrs);
  return applyTargets(texts, attrs);
}

/** Restaure intégralement le français. */
function restore() {
  for (const node of touchedNodes) {
    if (!node.isConnected) continue;
    // Si React a réécrit depuis, on ne touche à rien : sa valeur fait foi.
    if (written.get(node) !== node.nodeValue) continue;
    const src = originals.get(node);
    if (typeof src === 'string') {
      node.nodeValue = src;
      // On oublie notre écriture, sinon un retour en English verrait le nœud
      // comme « déjà traduit » et le laisserait en français.
      written.delete(node);
    }
  }
  for (const el of touchedAttrs) {
    if (!el.isConnected) continue;
    const map = attrState.get(el);
    if (!map) continue;
    for (const [attr, entry] of map) {
      if (!entry || entry.out === undefined) continue;
      if (el.getAttribute(attr) !== entry.out) continue;
      el.setAttribute(attr, entry.src);
      entry.out = undefined;
    }
  }
  touchedNodes = new Set();
  touchedAttrs = new Set();
  deferredTexts = [];
  deferredAttrs = [];
  pendingStrings.clear();
}

// ── Appels IA ─────────────────────────────────────────────────────
function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

async function fetchPending() {
  if (currentLang !== 'en' || !pendingStrings.size) return;
  if (Date.now() < mutedUntil) return;

  const wanted = [...pendingStrings];
  pendingStrings.clear();

  // Avant tout appel IA : récupérer ce que la brigade a déjà traduit.
  await ensureSharedCache();

  // Ce que la synchro vient de rapatrier n'a plus rien à faire dans le lot.
  const stillMissing = wanted.filter(s => resolve(s) === null);
  const batches = chunk(stillMissing, BATCH_SIZE).slice(0, MAX_BATCHES);
  const fraisTraduits = [];

  if (batches.length) {
    busy += batches.length;
    emit();
    try {
      const results = await Promise.all(batches.map(async (batch) => {
        try {
          const out = await translateTexts(batch);
          failures = 0;
          if (degraded) { degraded = false; emit(); }
          return { batch, out };
        } catch {
          failures += 1;
          // Hors-ligne ou service indisponible : on met en pause pour ne pas
          // marteler l'edge function à chaque re-rendu, et on le SIGNALE. Sans
          // ce signal, l'app a l'air à moitié traduite sans qu'on sache
          // pourquoi (vécu : edge function ai-proxy pas encore déployée).
          if (failures >= 3) {
            mutedUntil = Date.now() + 60000;
            if (!degraded) { degraded = true; emit(); }
          }
          return null;
        }
      }));

      for (const res of results) {
        if (!res) continue;
        res.batch.forEach((fr, i) => {
          const en = res.out[i];
          if (typeof en === 'string' && en.trim()) {
            memCache.set(fr, en.trim());
            fraisTraduits.push([fr, en.trim()]);
          }
        });
      }
    } finally {
      busy = Math.max(0, busy - batches.length);
      emit();
    }
  }

  if (fraisTraduits.length) {
    saveCacheSoon();
    // Ce qu'on vient de payer, la brigade n'aura pas à le repayer.
    // En arrière-plan : un échec d'écriture ne doit pas retarder l'affichage.
    if (etabId) pushSharedTranslations(etabId, fraisTraduits).catch(() => {});
  }

  if (currentLang !== 'en') return;

  // Réapplique UNIQUEMENT les cibles mises de côté. Aucun rescan.
  const texts = deferredTexts;
  const attrs = deferredAttrs;
  deferredTexts = [];
  deferredAttrs = [];
  if (applyTargets(texts, attrs)) scheduleFetch();
}

function scheduleFetch() {
  clearTimeout(fetchTimer);
  fetchTimer = setTimeout(() => { fetchPending(); }, FETCH_DELAY);
}

// ── Observation ───────────────────────────────────────────────────
function startObserver() {
  if (observer || typeof MutationObserver === 'undefined' || !document.body) return;

  observer = new MutationObserver((records) => {
    if (currentLang !== 'en') return;

    const texts = [];
    const attrs = [];

    for (const r of records) {
      if (r.type === 'childList') {
        for (const node of r.addedNodes) collectTargets(node, texts, attrs);
      } else if (r.type === 'characterData') {
        const node = r.target;
        // Notre propre écriture qui revient : on l'ignore, sinon on boucle.
        if (written.get(node) === node.nodeValue) continue;
        if (!hasForbiddenAncestor(node)) {
          const p = node.parentElement;
          if (!p || p.tagName !== VALUE_AS_TEXT) texts.push(node);
        }
      } else if (r.type === 'attributes') {
        const el = r.target;
        const attr = r.attributeName;
        const map = attrState.get(el);
        const entry = map && map.get(attr);
        if (entry && entry.out === el.getAttribute(attr)) continue;
        if (!isOptOutEl(el) && !hasForbiddenAncestor(el)) attrs.push([el, attr]);
      }
    }

    if (!texts.length && !attrs.length) return;

    // Synchrone : on est dans une microtâche, le navigateur n'a pas encore
    // peint. Tout ce que le glossaire et le cache savent traduire est appliqué
    // sans que l'utilisateur voie passer le français.
    if (applyTargets(texts, attrs)) scheduleFetch();
  });

  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ATTRS,
  });
}

function stopObserver() {
  if (!observer) return;
  observer.disconnect();
  observer = null;
}

// ── État exposé (bouton de bascule) ───────────────────────────────
let lastSignature = '';

function snapshot() {
  return { lang: currentLang, translating: busy > 0, degraded };
}

function emit() {
  const state = snapshot();
  // N'informer qu'en cas de VRAI changement : chaque emit provoque un rendu
  // React, donc des mutations, donc du travail pour le moteur.
  const signature = `${state.lang}|${state.translating}|${state.degraded}`;
  if (signature === lastSignature) return;
  lastSignature = signature;
  listeners.forEach((fn) => { try { fn(state); } catch { /* un abonné cassé n'arrête pas les autres */ } });
}

export function subscribe(fn) {
  listeners.add(fn);
  fn(snapshot());
  return () => listeners.delete(fn);
}

export function getLanguage() {
  return currentLang;
}

/**
 * Établissement courant : c'est le périmètre du cache partagé. En changer
 * relance une synchro sur le nouveau périmètre - le cache d'un client ne doit
 * jamais servir à un autre.
 */
export function setEtablissement(id) {
  const next = id || null;
  if (next === etabId) return;
  etabId = next;
  sharedLoaded = false;
  if (currentLang === 'en' && fullSweep()) scheduleFetch();
}

/**
 * Vide le cache local. Appelé à la déconnexion : une tablette de passe est
 * partagée, les noms de recettes d'un établissement n'ont pas à y rester.
 */
export function clearTranslationCache() {
  memCache.clear();
  sharedLoaded = false;
  try {
    localStorage.removeItem(CACHE_KEY);
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith(SYNC_KEY)) localStorage.removeItem(k);
    }
  } catch {
    // Mode privé ou quota : le cache mémoire est déjà vidé, c'est l'essentiel.
  }
}

/** Bascule l'app en 'en' (traduction à la volée) ou 'fr' (texte d'origine). */
export function setLanguage(lang) {
  const next = lang === 'en' ? 'en' : 'fr';
  if (next === currentLang) return;
  currentLang = next;

  if (typeof document !== 'undefined' && document.documentElement) {
    // Cohérence a11y + évite que le navigateur propose SA propre traduction
    // par-dessus la nôtre.
    document.documentElement.setAttribute('lang', next);
  }

  if (next === 'en') {
    if (!memCache.size) loadCache();
    // Nouvelle tentative : on repart d'une ardoise propre, pour que l'alerte
    // puisse se redéclencher si le service est toujours injoignable.
    failures = 0;
    mutedUntil = 0;
    degraded = false;
    startObserver();
    emit();
    if (fullSweep()) scheduleFetch();
  } else {
    stopObserver();
    clearTimeout(fetchTimer);
    restore();
    emit();
  }
}

/** Appelé au démarrage : réapplique la langue mémorisée. */
export function initTranslator(lang) {
  loadCache();
  if (lang === 'en') setLanguage('en');
  else if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.setAttribute('lang', 'fr');
  }
}
