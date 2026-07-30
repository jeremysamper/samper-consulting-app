// ════════════════════════════════════════════════════════════════
// Moteur de traduction à la volée du DOM (mode « Original » / « English »).
//
// Principe, identique aux widgets de traduction des sites web : on ne réécrit
// AUCUN module. Le moteur parcourt le DOM rendu, traduit le texte visible, et
// se remet à jour à chaque re-rendu React via un MutationObserver.
//
// Trois niveaux, du moins cher au plus cher :
//   1. glossaire statique  → instantané, hors-ligne, gratuit (voir glossary.js)
//   2. cache localStorage  → instantané, hors-ligne, gratuit (déjà traduit ici)
//   3. edge function IA    → une seule fois par phrase, puis mis en cache
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
import { translateTexts } from '../services/translationService.js';

const CACHE_KEY = 'sc_i18n_en_v1';
const CACHE_MAX = 5000;      // entrées conservées en localStorage
const BATCH_SIZE = 40;       // phrases par appel IA
const MAX_BATCHES = 10;      // plafond par passe → 400 phrases max
const FLUSH_DELAY = 150;     // ms de regroupement après un re-rendu React

// Balises dont le TEXTE ne doit jamais être touché.
// TEXTAREA est capital : son nœud texte EST sa valeur (donnée saisie).
// Le texte des <option> est en revanche traduit : seul l'attribut value compte
// pour le code, et une liste déroulante restée en français ferait tache.
const TEXT_SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA',
  'CODE', 'PRE', 'KBD', 'SAMP', 'CANVAS', 'SVG', 'IFRAME', 'OBJECT', 'EMBED',
  'VIDEO', 'AUDIO', 'MATH',
]);

// Attributs d'affichage traduits (jamais « value » : ce serait de la donnée).
// Ceux-là sont traités sur TOUTES les balises, y compris input et textarea :
// un placeholder est de l'affichage, pas de la saisie.
const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];

// ── État ──────────────────────────────────────────────────────────
const memCache = new Map();                 // 'Supprimer' → 'Delete'
const originals = new WeakMap();            // nœud texte  → source française
const written = new WeakMap();              // nœud texte  → dernière valeur écrite par nous
const attrState = new WeakMap();            // élément     → Map(attr → { src, out })
let touchedNodes = new Set();               // nœuds texte à restaurer
let touchedAttrs = new Set();               // éléments à restaurer

let currentLang = 'fr';
let observer = null;
let flushTimer = null;
let busy = 0;                               // requêtes IA en vol
let failures = 0;                           // échecs consécutifs (mode hors-ligne)
let mutedUntil = 0;                         // pause après échecs répétés
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

/**
 * Un ancêtre marque-t-il ce nœud comme intraduisible ?
 * Vaut pour le texte comme pour les attributs.
 */
function hasOptOut(node) {
  let el = node.nodeType === 1 ? node : node.parentElement;
  while (el) {
    if (el.hasAttribute) {
      if (el.hasAttribute('data-no-translate')) return true;
      if (el.getAttribute('translate') === 'no') return true;
      if (el.classList && el.classList.contains('notranslate')) return true;
    }
    el = el.parentElement;
  }
  return false;
}

/** Le TEXTE de ce nœud est-il hors périmètre (balise interdite ou opt-out) ? */
function isSkippedForText(node) {
  let el = node.nodeType === 1 ? node : node.parentElement;
  while (el) {
    const tag = el.tagName ? el.tagName.toUpperCase() : '';
    if (TEXT_SKIP_TAGS.has(tag)) return true;
    el = el.parentElement;
  }
  return hasOptOut(node);
}

// ── Résolution ────────────────────────────────────────────────────
/** Traduction connue (glossaire puis cache), ou null s'il faut appeler l'IA. */
function resolve(core) {
  const fromGlossary = lookupGlossary(core);
  if (fromGlossary) return fromGlossary;
  const cached = memCache.get(core);
  return cached === undefined ? null : cached;
}

function writeText(node, value) {
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

// ── Passe de traduction ───────────────────────────────────────────
/**
 * Parcourt le document, traduit tout ce qui est déjà connu, et renvoie les
 * chaînes encore inconnues à envoyer à l'IA.
 */
function sweep() {
  const missing = new Set();
  if (typeof document === 'undefined' || !document.body) return missing;

  // ── Nœuds texte ──
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const nodes = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);

  for (const node of nodes) {
    const value = node.nodeValue;
    // Déjà traduit par nous et intact depuis : rien à faire.
    if (written.get(node) === value) continue;
    if (isSkippedForText(node)) continue;

    // Sinon la valeur courante est la source (premier passage, ou React a
    // réécrit le nœud avec un nouveau texte français).
    const source = value;
    const { pre, core, post } = splitAffixes(source);
    if (!isTranslatable(core)) continue;

    originals.set(node, source);
    const en = resolve(core);
    if (en === null) missing.add(core);
    else if (en !== core) writeText(node, pre + en + post);
  }

  // ── Attributs d'affichage ──
  const els = document.body.querySelectorAll('[placeholder],[title],[aria-label],[alt]');
  for (const el of els) {
    if (hasOptOut(el)) continue;
    for (const attr of ATTRS) {
      if (!el.hasAttribute(attr)) continue;
      const value = el.getAttribute(attr);
      let map = attrState.get(el);
      const entry = map && map.get(attr);
      if (entry && entry.out === value) continue;   // notre écriture, intacte

      const { pre, core, post } = splitAffixes(value);
      if (!isTranslatable(core)) continue;

      if (!map) { map = new Map(); attrState.set(el, map); }
      map.set(attr, { src: value, out: undefined });

      const en = resolve(core);
      if (en === null) missing.add(core);
      else if (en !== core) writeAttr(el, attr, pre + en + post);
    }
  }

  // Les nœuds démontés par React n'ont plus à être restaurés : on les lâche
  // pour que le Set ne grossisse pas indéfiniment au fil de la navigation.
  if (touchedNodes.size > 2000) {
    touchedNodes = new Set([...touchedNodes].filter((n) => n.isConnected));
  }
  if (touchedAttrs.size > 2000) {
    touchedAttrs = new Set([...touchedAttrs].filter((el) => el.isConnected));
  }

  return missing;
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
}

// ── Appels IA ─────────────────────────────────────────────────────
function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

async function fetchMissing(missing) {
  if (!missing.size) return false;
  if (Date.now() < mutedUntil) return false;

  const batches = chunk([...missing], BATCH_SIZE).slice(0, MAX_BATCHES);
  let gotSomething = false;

  busy += batches.length;
  emit();
  try {
    const results = await Promise.all(batches.map(async (batch) => {
      try {
        const out = await translateTexts(batch);
        failures = 0;
        return { batch, out };
      } catch {
        failures += 1;
        // Hors-ligne ou service indisponible : on met en pause pour ne pas
        // marteler l'edge function à chaque re-rendu.
        if (failures >= 3) mutedUntil = Date.now() + 60000;
        return null;
      }
    }));

    for (const res of results) {
      if (!res) continue;
      res.batch.forEach((fr, i) => {
        const en = res.out[i];
        if (typeof en === 'string' && en.trim()) {
          memCache.set(fr, en.trim());
          gotSomething = true;
        }
      });
    }
  } finally {
    busy = Math.max(0, busy - batches.length);
    emit();
  }

  if (gotSomething) saveCacheSoon();
  return gotSomething;
}

// ── Boucle ────────────────────────────────────────────────────────
let running = false;
let dirty = false;

async function flush() {
  if (currentLang !== 'en') return;
  // Un re-rendu pendant un appel IA ne doit pas être perdu : on le note et on
  // reboucle à la fin plutôt que d'abandonner la passe.
  if (running) { dirty = true; return; }

  running = true;
  try {
    do {
      dirty = false;
      const missing = sweep();
      if (missing.size) {
        const got = await fetchMissing(missing);
        if (got && currentLang === 'en') sweep();   // applique ce qui vient d'arriver
      }
    } while (dirty && currentLang === 'en');
  } finally {
    running = false;
  }
}

function scheduleFlush() {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => { flush(); }, FLUSH_DELAY);
}

function startObserver() {
  if (observer || typeof MutationObserver === 'undefined' || !document.body) return;
  observer = new MutationObserver(() => { scheduleFlush(); });
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
function emit() {
  const state = { lang: currentLang, translating: busy > 0 };
  listeners.forEach((fn) => { try { fn(state); } catch { /* un abonné cassé n'arrête pas les autres */ } });
}

export function subscribe(fn) {
  listeners.add(fn);
  fn({ lang: currentLang, translating: busy > 0 });
  return () => listeners.delete(fn);
}

export function getLanguage() {
  return currentLang;
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
    startObserver();
    emit();
    flush();
  } else {
    stopObserver();
    clearTimeout(flushTimer);
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
