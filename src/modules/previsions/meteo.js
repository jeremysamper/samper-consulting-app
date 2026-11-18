// ═══════════════════════════════════════════════════════════════════════════
// Météo du module Réservations : la localisation de l'établissement, l'appel
// de la route /api/meteo (données ouvertes de MétéoSuisse, voir api/meteo.ts),
// le cache de la journée et la lecture par service.
//
// La localisation est le NPA écrit dans l'adresse de l'établissement
// (« Rue Centrale 29, 1983 Evolène ») : la table n'a ni NPA ni coordonnées à
// part, et aucune migration n'est faite pour les ajouter. Sans NPA lisible,
// pas de météo, et l'écran le dit.
//
// Tout ce qui suit le chargement est pur, sans navigateur : testé dans
// previsionCouverts.test.mjs.
// ═══════════════════════════════════════════════════════════════════════════

import { readJson, writeJson } from '../../utils/storage.js';
import { zurichToday } from '../../utils/zurichTime.js';

// Jour de précipitations : 1 mm ou plus, le seuil des « jours de
// précipitations » de la climatologie de MétéoSuisse. Le même seuil classe
// les jours passés (station de mesure) et les jours prévus.
export const SEUIL_PRECIP_MM = 1;

// Heures locales de FIN des intervalles horaires lus pour un service (la
// valeur horaire porte sur l'heure qui finit à son horodatage) : midi de
// 11 h à 14 h, soir de 18 h à 22 h.
export const HEURES_SERVICE = { midi: [12, 13, 14], soir: [19, 20, 21, 22] };

// Pluie ou neige sur le service : 0,3 mm ou plus sur ses heures.
export const SEUIL_PLUIE_SERVICE_MM = 0.3;

// Le soleil du midi : part de l'ensoleillement possible sur ses heures.
const PART_ENSOLEILLE = 0.5;
const PART_ECLAIRCIES = 0.15;

const CLE_CACHE = 'sc_meteo_npa_';

// ── Localisation ─────────────────────────────────────────────────────────
// Le dernier groupe de quatre chiffres suivi d'une localité. « Route de
// collombé 24 A » n'en a pas : pas de localisation.
export function npaDepuisAdresse(adresse) {
  const s = String(adresse || '');
  const motif = /(?:^|[\s,-])([1-9]\d{3})\s+(?=[A-Za-zÀ-ÿ])/g;
  let m;
  let npa = null;
  while ((m = motif.exec(s))) npa = m[1];
  return npa;
}

// ── Heures ───────────────────────────────────────────────────────────────
let formatZurich = null;
// Horodatage UTC « AAAAMMJJHHMM » → jour et heure à Zurich.
export function heureLocale(horodatage) {
  const t = String(horodatage || '');
  if (!/^\d{12}$/.test(t)) return null;
  const instant = new Date(Date.UTC(+t.slice(0, 4), +t.slice(4, 6) - 1, +t.slice(6, 8), +t.slice(8, 10), +t.slice(10, 12)));
  if (!formatZurich) {
    formatZurich = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
    });
  }
  const p = Object.fromEntries(formatZurich.formatToParts(instant).map((x) => [x.type, x.value]));
  return { jour: `${p.year}-${p.month}-${p.day}`, heure: Number(p.hour) };
}

const fini = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// Réponse de la route → forme de travail. null si elle n'a pas la forme
// attendue (une page HTML servie à la place de la route, par exemple).
export function lireMeteo(reponse) {
  if (!reponse || typeof reponse !== 'object' || !reponse.point || !Array.isArray(reponse.heures)) return null;
  const heures = [];
  for (const [t, pluie, soleil] of reponse.heures) {
    const h = heureLocale(t);
    if (h) heures.push({ ...h, pluie: fini(pluie), soleil: fini(soleil) });
  }
  const jours = new Map();
  for (const [jour, pluie, tmax, tmin] of Array.isArray(reponse.jours) ? reponse.jours : []) {
    jours.set(jour, { pluie: fini(pluie), tmax: fini(tmax), tmin: fini(tmin) });
  }
  const historique = new Map();
  for (const [jour, pluie] of Array.isArray(reponse.historique) ? reponse.historique : []) {
    if (fini(pluie) !== null) historique.set(jour, pluie);
  }
  return {
    point: reponse.point,
    station: reponse.station || null,
    run: reponse.run || null,
    heures,
    jours,
    historique,
  };
}

// ── Lecture par service ──────────────────────────────────────────────────
// Le temps prévu d'un service : un libellé simple, les précipitations sur
// ses heures et les températures du jour. null hors des jours publiés.
//
// Pluie ou neige d'après les températures du jour (l'isotherme horaire est
// publiée triée par heure, trop lourde à lire) : maximum à 1 °C ou moins,
// neige ; minimum à 1 °C ou moins, pluie ou neige ; sinon pluie.
export function meteoDuService(meteo, jour, service) {
  if (!meteo) return null;
  const heures = HEURES_SERVICE[service] || [];
  const lignes = meteo.heures.filter((h) => h.jour === jour && heures.includes(h.heure));
  if (!lignes.length) return null;
  const pluie = lignes.reduce((s, h) => s + (h.pluie || 0), 0);
  const soleil = lignes.reduce((s, h) => s + (h.soleil || 0), 0) / (60 * lignes.length);
  const j = meteo.jours.get(jour) || {};
  let libelle;
  if (pluie >= SEUIL_PLUIE_SERVICE_MM) {
    if (j.tmax !== null && j.tmax !== undefined && j.tmax <= 1) libelle = 'Neige';
    else if (j.tmin === null || j.tmin === undefined || j.tmin <= 1) libelle = 'Pluie ou neige';
    else libelle = 'Pluie';
  } else if (service === 'midi') {
    libelle = soleil >= PART_ENSOLEILLE ? 'Ensoleillé' : soleil >= PART_ECLAIRCIES ? 'Éclaircies' : 'Nuageux';
  } else {
    libelle = 'Temps sec';
  }
  return {
    libelle,
    pluieMm: Math.round(pluie * 10) / 10,
    tmax: j.tmax ?? null,
    tmin: j.tmin ?? null,
  };
}

// Classe d'un jour prévu : 'precipitations', 'sec', ou null hors publication.
export function classeDuJour(meteo, jour) {
  const p = meteo?.jours.get(jour)?.pluie;
  if (p === null || p === undefined) return null;
  return p >= SEUIL_PRECIP_MM ? 'precipitations' : 'sec';
}

// ── Chargement ───────────────────────────────────────────────────────────
// Une lecture par NPA et par jour : le résultat est gardé sur l'appareil
// jusqu'au lendemain (date de Zurich). Un échec n'est jamais gardé.
export async function chargerMeteo(npa, { aujourdhui = zurichToday(), fetchFn = (u) => fetch(u) } = {}) {
  const cle = `${CLE_CACHE}${npa}`;
  const garde = readJson(cle);
  if (garde && garde.jour === aujourdhui) {
    const lue = lireMeteo(garde.reponse);
    if (lue) return lue;
  }
  const r = await fetchFn(`/api/meteo?npa=${encodeURIComponent(npa)}`);
  const type = r.headers?.get?.('content-type') || '';
  if (!r.ok || !type.includes('application/json')) throw new Error(`météo ${r.status}`);
  const reponse = await r.json();
  const lue = lireMeteo(reponse);
  if (!lue) throw new Error('météo illisible');
  writeJson(cle, { jour: aujourdhui, reponse });
  return lue;
}
