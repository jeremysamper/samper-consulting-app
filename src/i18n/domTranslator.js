// ════════════════════════════════════════════════════════════════
// Moteur de traduction à la volée du DOM (modes « Original », « English »,
// « Español », « Deutsch », « Italiano », « Português »).
//
// Principe, identique aux widgets de traduction des sites web : on ne réécrit
// AUCUN module. Le moteur traduit le DOM rendu et se remet à jour à chaque
// re-rendu React via un MutationObserver.
//
// Trois niveaux, du moins cher au plus cher, chacun tenu PAR LANGUE :
//   1. glossaire statique  → instantané, hors-ligne, gratuit (glossary.js,
//                            glossaryEs.js, glossaryDe.js, glossaryIt.js,
//                            glossaryPt.js
//                            chargés à la demande)
//   2. cache localStorage  → instantané, hors-ligne, gratuit (déjà traduit ici)
//   3. edge function IA    → une seule fois par phrase, puis mis en cache
//
// La source est TOUJOURS le français d'origine : passer d'English à Español
// restaure d'abord le français, puis retraduit ; de même vers Deutsch, Italiano et Português. On ne
// traduit jamais une traduction.
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
// GLOSSAIRE À LA DEMANDE. Les tables espagnole, allemande, italienne et portugaise arrivent par
// import() (glossary.js, loadGlossary). Tant que celle de la langue demandée
// n'est pas là, rien ne change : l'écran et le moteur restent dans la langue
// en cours, sans balayage ni appel IA dans la nouvelle. Puis tout bascule dans
// la microtâche qui reçoit le fichier : retour au français et traduction se
// suivent sans peinture entre les deux, comme avant.
//
// GARDE-FOUS (aucune donnée métier ne doit pouvoir être corrompue) :
//   · on n'écrit JAMAIS dans la value d'un input/textarea/select : seul le
//     texte affiché et quelques attributs d'affichage sont touchés ;
//   · le texte français d'origine est conservé et restauré à l'identique au
//     retour en mode Original ;
//   · les PDF générés en vectoriel (fiche recette, étiquettes DLC, MEP,
//     commande) partent des données, pas du DOM : ils restent en français.
// ════════════════════════════════════════════════════════════════
import { splitAffixes } from './affixes.js';
import { DO_NOT_TRANSLATE, isGlossaryReady, loadGlossary, lookupGlossary } from './glossary.js';
import { fetchSharedTranslations, pushSharedTranslations, translateTexts } from '../services/translationService.js';

// Langues cibles. 'fr' n'en est pas une : c'est le mode Original, sans moteur.
export const TARGET_LANGS = ['en', 'es', 'de', 'it', 'pt'];

// Clé du cache local par langue. L'anglais garde sa clé historique : les
// appareils déjà en English ne reperdent pas ce qu'ils ont traduit.
const CACHE_KEY_PREFIX = 'sc_i18n_';
const cacheKey = (lang) => `${CACHE_KEY_PREFIX}${lang}_v1`;
// Repère de synchro du cache partagé : + id d'établissement pour l'anglais
// (clé historique), + 'es_' + id pour l'espagnol, + 'de_' + id pour l'allemand,
// + 'it_' + id pour l'italien, + 'pt_' + id pour le portugais.
const SYNC_KEY = 'sc_i18n_sync_';
const CACHE_MAX = 5000;      // entrées conservées en localStorage, par langue
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
// Cache mémoire par langue : { en: 'Supprimer' → 'Delete', es: 'Supprimer' → 'Eliminar', de: 'Supprimer' → 'Löschen' }
const memCaches = Object.fromEntries(TARGET_LANGS.map((l) => [l, new Map()]));
const cacheLoaded = new Set();              // langues dont le cache local est chargé
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
let pendingLang = null;                     // langue choisie dont le glossaire est en route
let observer = null;
let fetchTimer = null;
let busy = 0;                               // requêtes IA en vol
let failures = 0;                           // échecs consécutifs (mode hors-ligne)
let mutedUntil = 0;                         // pause après échecs répétés
let degraded = false;                       // service IA injoignable → glossaire seul
let etabId = null;                          // établissement courant (scope du cache partagé)
const sharedLoaded = new Set();             // langues dont le cache partagé est rapatrié pour cet établissement
const listeners = new Set();

const isTarget = (lang) => TARGET_LANGS.includes(lang);

// ── Cache persistant ──────────────────────────────────────────────
function loadCache(lang) {
  if (cacheLoaded.has(lang)) return;
  cacheLoaded.add(lang);
  const cache = memCaches[lang];
  try {
    const raw = localStorage.getItem(cacheKey(lang));
    if (!raw) return;
    const obj = JSON.parse(raw);
    for (const [fr, out] of Object.entries(obj || {})) {
      if (typeof out === 'string' && !cache.has(fr)) cache.set(fr, out);
    }
  } catch {
    // Cache illisible ou quota : on repart d'un cache vide, sans casser l'app.
  }
}

const saveTimers = {};
function saveCacheSoon(lang) {
  clearTimeout(saveTimers[lang]);
  saveTimers[lang] = setTimeout(() => {
    try {
      // On borne la taille : les entrées les plus anciennes sautent en premier.
      const entries = [...memCaches[lang].entries()];
      const kept = entries.length > CACHE_MAX ? entries.slice(-CACHE_MAX) : entries;
      localStorage.setItem(cacheKey(lang), JSON.stringify(Object.fromEntries(kept)));
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
 * dernier import de CET appareil, langue par langue.
 */
async function ensureSharedCache(lang) {
  if (sharedLoaded.has(lang) || !etabId) return;
  sharedLoaded.add(lang);   // une seule tentative par langue, établissement et session

  const key = SYNC_KEY + (lang === 'en' ? '' : `${lang}_`) + etabId;
  const cache = memCaches[lang];
  try {
    const since = localStorage.getItem(key) || null;
    const { pairs, latest } = await fetchSharedTranslations(etabId, since, lang);
    for (const [fr, out] of pairs) {
      if (!cache.has(fr)) cache.set(fr, out);
    }
    if (latest) {
      try { localStorage.setItem(key, latest); } catch { /* quota : on resyncera */ }
    }
    if (pairs.length) saveCacheSoon(lang);
  } catch {
    // Base injoignable (hors ligne, RLS, table absente) : on continue sur le
    // cache local. La traduction ne doit jamais dépendre de cette optimisation.
  }
}

// ── Éligibilité ───────────────────────────────────────────────────
// Découpe pre / core / post : voir affixes.js, partagé avec le glossaire, qui
// indexe ses clés sur le même cœur.
const URL_LIKE = /^(https?:\/\/|www\.|[\w.+-]+@[\w-]+\.)/i;
const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;
// Donnée personnelle, jamais un libellé d'interface : une chaîne qui contient
// un e-mail ou un téléphone (suisse ou international) reste en français et ne
// part jamais à ai-proxy, où qu'ils soient dans la phrase.
const EMAIL_IN = /[\w.+-]+@[\w-]+\.[\w-]{2,}/;
const PHONE_IN = /(?:\+|\b00)\s?\d(?:[\s.()/\u{00a0}\u{202f}-]?\d){7,}|\b0\d{2}(?:[\s./\u{00a0}\u{202f}-]?\d{2,3}){3}\b/u;

/** Le cœur de chaîne mérite-t-il une traduction ? */
function isTranslatable(core) {
  if (!core || core.length > 600) return false;
  if (DO_NOT_TRANSLATE.has(core)) return false;
  if (URL_LIKE.test(core) || UUID_LIKE.test(core) || ISO_DATE.test(core)) return false;
  if (EMAIL_IN.test(core) || PHONE_IN.test(core)) return false;
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
/**
 * Traduction connue (glossaire puis cache), ou null s'il faut appeler l'IA.
 * Langue affichée par défaut ; fetchPending passe la sienne, figée avant ses
 * await, pour ne jamais ranger une réponse dans le cache d'une autre langue.
 */
function resolve(core, lang = currentLang) {
  const fromGlossary = lookupGlossary(core, lang);
  if (fromGlossary) return fromGlossary;
  const cached = memCaches[lang].get(core);
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
    const out = resolve(core);
    if (out === null) {
      pendingStrings.add(core);
      deferredTexts.push(node);
      anyMissing = true;
    } else if (out !== core) {
      writeTextNode(node, pre + out + post);
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
    const out = resolve(core);
    if (out === null) {
      pendingStrings.add(core);
      deferredAttrs.push(pair);
      anyMissing = true;
    } else if (out !== core) {
      writeAttr(el, attr, pre + out + post);
    }
  }

  return anyMissing;
}

/** Passe complète : uniquement au basculement vers une langue traduite. */
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
      // On oublie notre écriture, sinon un retour en langue traduite verrait le nœud
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
  // Langue figée pour toute la passe : si l'utilisateur change de langue
  // pendant l'appel, la réponse va quand même dans le bon cache, et n'est pas
  // appliquée à l'écran (voir la garde en fin de fonction).
  const lang = currentLang;
  if (!isTarget(lang) || !pendingStrings.size) return;
  if (Date.now() < mutedUntil) return;

  const wanted = [...pendingStrings];
  pendingStrings.clear();

  // Avant tout appel IA : récupérer ce que la brigade a déjà traduit.
  await ensureSharedCache(lang);

  // Ce que la synchro vient de rapatrier n'a plus rien à faire dans le lot.
  const stillMissing = wanted.filter(s => resolve(s, lang) === null);
  const batches = chunk(stillMissing, BATCH_SIZE).slice(0, MAX_BATCHES);
  const fraisTraduits = [];

  if (batches.length) {
    busy += batches.length;
    emit();
    try {
      const results = await Promise.all(batches.map(async (batch) => {
        try {
          const out = await translateTexts(batch, lang);
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

      const cache = memCaches[lang];
      for (const res of results) {
        if (!res) continue;
        res.batch.forEach((fr, i) => {
          const out = res.out[i];
          if (typeof out === 'string' && out.trim()) {
            cache.set(fr, out.trim());
            fraisTraduits.push([fr, out.trim()]);
          }
        });
      }
    } finally {
      busy = Math.max(0, busy - batches.length);
      emit();
    }
  }

  if (fraisTraduits.length) {
    saveCacheSoon(lang);
    // Ce qu'on vient de payer, la brigade n'aura pas à le repayer.
    // En arrière-plan : un échec d'écriture ne doit pas retarder l'affichage.
    if (etabId) pushSharedTranslations(etabId, fraisTraduits, lang).catch(() => {});
  }

  // Langue changée entre-temps : les cibles différées ont été vidées par
  // restore(), et la nouvelle langue a lancé sa propre passe.
  if (currentLang !== lang) return;

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
    if (!isTarget(currentLang)) return;

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

// Pendant le chargement d'un glossaire, le sélecteur montre déjà la langue
// choisie, avec son indicateur de traduction en cours.
function snapshot() {
  if (pendingLang) return { lang: pendingLang, translating: true, degraded: false };
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

/** Langue choisie, celle que montre le sélecteur (voir snapshot). */
export function getLanguage() {
  return pendingLang || currentLang;
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
  sharedLoaded.clear();
  if (isTarget(currentLang) && fullSweep()) scheduleFetch();
}

/**
 * Vide le cache local, toutes langues. Appelé à la déconnexion : une tablette
 * de passe est partagée, les noms de recettes d'un établissement n'ont pas à y
 * rester.
 */
export function clearTranslationCache() {
  for (const lang of TARGET_LANGS) {
    memCaches[lang].clear();
    clearTimeout(saveTimers[lang]);
  }
  cacheLoaded.clear();
  sharedLoaded.clear();
  try {
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const k = localStorage.key(i);
      if (!k) continue;
      // Couvre sc_i18n_en_v1, sc_i18n_es_v1, sc_i18n_de_v1, sc_i18n_it_v1, sc_i18n_pt_v1 et tous les repères sc_i18n_sync_*.
      if (k.startsWith(SYNC_KEY) || TARGET_LANGS.some((l) => k === cacheKey(l))) {
        localStorage.removeItem(k);
      }
    }
  } catch {
    // Mode privé ou quota : le cache mémoire est déjà vidé, c'est l'essentiel.
  }
}

/**
 * Bascule l'app en 'en', 'es', 'de', 'it' ou 'pt' (traduction à la volée) ou 'fr' (texte
 * d'origine). Toute autre valeur vaut 'fr'.
 */
export function setLanguage(lang) {
  const next = isTarget(lang) ? lang : 'fr';

  // Glossaire pas encore chargé (espagnol, allemand, italien, portugais) : on n'applique rien
  // avant lui. Sinon le premier balayage enverrait tout l'écran à l'IA.
  if (isTarget(next) && !isGlossaryReady(next)) {
    if (pendingLang === next) return;
    pendingLang = next;
    emit();
    loadGlossary(next).then(() => {
      if (pendingLang !== next) return;   // autre choix entre-temps
      pendingLang = null;
      applyLanguage(next);
    }, () => {
      if (pendingLang !== next) return;
      // Fichier injoignable : on reste dans la langue en cours plutôt que de
      // tout envoyer à l'IA. Le choix suivant retentera le chargement.
      pendingLang = null;
      emit();
    });
    return;
  }

  // Un choix connu annule celui qui attendait son glossaire.
  const wasPending = pendingLang !== null;
  pendingLang = null;
  if (next === currentLang) {
    if (wasPending) emit();
    return;
  }
  applyLanguage(next);
}

/** Applique une langue dont le glossaire est prêt. Synchrone. */
function applyLanguage(next) {
  const prev = currentLang;
  currentLang = next;

  if (typeof document !== 'undefined' && document.documentElement) {
    // Cohérence a11y + évite que le navigateur propose SA propre traduction
    // par-dessus la nôtre.
    document.documentElement.setAttribute('lang', next);
  }

  // Quitter une langue traduite, c'est d'abord revenir au français d'origine :
  // English → Español, Deutsch, Italiano ou Português retraduit depuis la source, jamais depuis
  // l'anglais.
  // L'observateur est coupé avant restore() pour ne pas recevoir nos propres
  // réécritures (disconnect jette les enregistrements en attente).
  stopObserver();
  clearTimeout(fetchTimer);
  if (isTarget(prev)) restore();

  if (isTarget(next)) {
    loadCache(next);
    // Nouvelle tentative : on repart d'une ardoise propre, pour que l'alerte
    // puisse se redéclencher si le service est toujours injoignable.
    failures = 0;
    mutedUntil = 0;
    degraded = false;
    startObserver();
    emit();
    if (fullSweep()) scheduleFetch();
  } else {
    emit();
  }
}

/**
 * Demande à l'avance le glossaire d'une langue (la langue mémorisée, dès le
 * chargement de l'app) : quand initTranslator l'applique, il est déjà là.
 * Sans effet en Original et en anglais.
 */
export function preloadGlossary(lang) {
  if (isTarget(lang) && !isGlossaryReady(lang)) loadGlossary(lang).catch(() => {});
}

/**
 * Appelé au démarrage : réapplique la langue mémorisée. En espagnol, en
 * allemand, en italien ou en portugais, la langue s'applique quand son glossaire est chargé.
 */
export function initTranslator(lang) {
  if (isTarget(lang)) setLanguage(lang);
  else if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.setAttribute('lang', 'fr');
  }
}
