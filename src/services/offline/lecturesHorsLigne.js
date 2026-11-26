// ─────────────────────────────────────────────────────────────
// Lectures servies par le cache du service worker (lot 24 du panel).
//
// Les lectures REST d'un écran passent par une règle « réseau d'abord » du
// service worker (vite.config.js) : sans réseau, la réponse vient du cache,
// sans erreur, et rien dans la réponse ne le dit à l'écran. Ce module garde
// sur l'appareil, par établissement :
//   * l'heure de la dernière lecture faite avec le réseau, par source
//     (« Lu hors ligne, dernière lecture à 14:32 ») ;
//   * les fiches ouvertes au moins une fois avec le réseau, par source :
//     hors ligne, une fiche jamais ouverte sur cet appareil le dit au lieu
//     d'afficher une lecture qu'on n'a jamais regardée.
//
// Le réseau se lit par navigator.onLine, comme le bandeau et l'écran HACCP
// (useOnlineStatus) : un faux positif (wifi sans internet) affiche la lecture
// comme fraîche, il ne bloque rien.
//
// Ces traces suivent le cache : elles sont oubliées au changement
// d'établissement et à la déconnexion, avec les caches de données
// (offlineCaches.js).
// ─────────────────────────────────────────────────────────────

import { readJson, removeStorageKeys, writeJson } from '../../utils/storage.js';
import { zurichDateHeure } from '../../utils/zurichTime.js';

export const CLE_LECTURES_HORS_LIGNE = 'sc_lectures_hors_ligne';
// Fiches retenues par source et par établissement : les plus récentes.
const MAX_VUES = 300;

function etat() {
  const brut = readJson(CLE_LECTURES_HORS_LIGNE, null);
  const objet = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  return { lectures: objet(brut?.lectures), vues: objet(brut?.vues) };
}

export function enLigneMaintenant() {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

// Lecture réussie avec le réseau : son heure est gardée pour l'affichage hors
// ligne. Sans établissement, rien n'est gardé.
export function noterLecture(etabId, source, quand = Date.now()) {
  if (!etabId || !source) return;
  const e = etat();
  const parEtab = { ...(e.lectures[etabId] || {}), [source]: quand };
  writeJson(CLE_LECTURES_HORS_LIGNE, { ...e, lectures: { ...e.lectures, [etabId]: parEtab } });
}

export function lireDerniereLecture(etabId, source) {
  if (!etabId || !source) return null;
  const v = Number(etat().lectures[etabId]?.[source]);
  return Number.isFinite(v) && v > 0 ? v : null;
}

// Fiche ouverte avec le réseau sur cet appareil.
export function marquerVue(etabId, source, id) {
  if (!etabId || !source || !id) return;
  const e = etat();
  const parEtab = e.vues[etabId] || {};
  const avant = Array.isArray(parEtab[source]) ? parEtab[source].filter((x) => x !== id) : [];
  const liste = [...avant, id].slice(-MAX_VUES);
  writeJson(CLE_LECTURES_HORS_LIGNE, {
    ...e,
    vues: { ...e.vues, [etabId]: { ...parEtab, [source]: liste } },
  });
}

export function estVue(etabId, source, id) {
  if (!etabId || !source || !id) return false;
  const liste = etat().vues[etabId]?.[source];
  return Array.isArray(liste) && liste.includes(id);
}

export function oublierLectures() {
  removeStorageKeys([CLE_LECTURES_HORS_LIGNE]);
}

// Phrase « lu hors ligne » d'une heure de dernière lecture : le texte fixe
// (traduit par le glossaire) et la valeur à poser hors traduction. Même jour
// à Zurich : l'heure seule ; un autre jour : la date courte et l'heure ; une
// autre année : la date entière. Sans heure connue : la phrase courte.
export function libelleDerniereLecture(quand, maintenant = Date.now()) {
  if (!Number.isFinite(Number(quand)) || !quand) return { texte: 'Lu hors ligne.', valeur: null };
  const lu = zurichDateHeure(new Date(Number(quand)).toISOString());
  const jour = zurichDateHeure(new Date(Number(maintenant)).toISOString());
  if (lu.jour === jour.jour) return { texte: 'Lu hors ligne, dernière lecture à', valeur: lu.heure };
  const date = lu.jour.slice(0, 4) === jour.jour.slice(0, 4) ? lu.date.slice(0, 5) : lu.date;
  return { texte: 'Lu hors ligne, dernière lecture le', valeur: `${date}, ${lu.heure}` };
}
