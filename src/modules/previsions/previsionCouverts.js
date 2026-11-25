// ═══════════════════════════════════════════════════════════════════════════
// Prévision des couverts des 7 prochains jours, service par service.
//
// Modèle statistique simple, sans IA (l'IA est réservée au consultant) et
// explicable à l'écran :
//   1. moyenne des couverts réalisés des mêmes services (même jour de la
//      semaine, même service) sur les 8 dernières semaines, moins si
//      l'historique de l'établissement est plus court ; sous 4 semaines,
//      pas de prévision ;
//   2. correction météo, seulement si l'effet se mesure sur l'historique de
//      l'établissement (voir mesurerEffet) ;
//   3. les réservations déjà prises sont un plancher : la prévision ne
//      descend jamais en dessous.
//
// Couverts réalisés : les réservations passées, sauf les annulées, les
// no-shows et les demandes en ligne restées sans réponse. Une réservation
// passée encore « attendue » compte : les équipes ne marquent pas toujours
// l'arrivée (Woodland, octobre et novembre 2026 : 120 réservations passées
// « attendues » pour 87 « arrivées »). Les clients sans réservation entrent
// par l'origine 'passage' (PassageRapide, plan de salle) et comptent comme
// les autres. La Caisse n'est pas lue : elle n'a pas encore de vraies ventes
// et ses tickets doubleraient les réservations qu'ils encaissent.
//
// Fonctions pures : previsionCouverts.test.mjs.
// ═══════════════════════════════════════════════════════════════════════════

import { SERVICES_AFFICHES, serviceAffiche } from './statutsReservation.js';
import { SEUIL_PRECIP_MM, classeDuJour, meteoDuService } from './meteo.js';
import { zurichAjouterJours } from '../../utils/zurichTime.js';
import { maisonFermee } from '../../utils/reglagesMaison.js';
import { sejourMange } from '../hebergement/pension.js';

export const JOURS_PREVUS = 7;
export const SEMAINES = 8;        // semaines de la moyenne, par défaut
export const SEMAINES_MIN = 4;    // en dessous : pas de prévision

// Effet de la météo. Il se mesure sur les 12 dernières semaines du même
// service : chaque jour passé est rapporté à la moyenne de son jour de la
// semaine (un samedi pluvieux se compare aux samedis), puis on compare les
// jours de précipitations (1 mm ou plus à la station de mesure la plus
// proche) aux jours secs. L'effet ne compte que si :
//   - chaque sorte de jour réunit au moins 8 services ;
//   - l'écart des deux moyennes dépasse deux erreurs-types (test de Welch,
//     environ 95 % de chances que l'écart ne soit pas le hasard) ;
//   - il change la prévision d'au moins 5 %.
// Sinon la météo s'affiche sans corriger la prévision, et l'écran le dit.
export const SEMAINES_EFFET = 12;
export const JOURS_MIN_PAR_CLASSE = 8;
export const ECART_MIN_ERREURS_TYPES = 2;
export const EFFET_MIN = 0.05;

// Jour de la semaine d'une date AAAA-MM-JJ (0 = dimanche), sans fuseau.
export function jourSemaine(date) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

const moyenneDe = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
function varianceDe(xs) {
  if (xs.length < 2) return 0;
  const m = moyenneDe(xs);
  return xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
}

// Couverts par « date|service ». Les annulées et les no-shows ne comptent
// jamais ; les demandes en ligne comptent dans les réservations à venir
// (le planning les montre et les compte), pas dans le réalisé.
export function couvertsParService(resas, { realise }) {
  const parCle = new Map();
  for (const r of resas || []) {
    if (r.statut === 'annule' || r.statut === 'no_show') continue;
    if (realise && r.statut === 'demande') continue;
    const svc = serviceAffiche(r.service);
    if (!SERVICES_AFFICHES.includes(svc)) continue;
    const cle = `${r.date_service}|${svc}`;
    parCle.set(cle, (parCle.get(cle) || 0) + (Number(r.nb_couverts) || 0));
  }
  return parCle;
}

// Hôtes en pension par « date|service », sur les JOURS_PREVUS jours dès
// aujourd'hui : le déjeuner compte au midi, le dîner au soir, le
// petit-déjeuner nulle part. Lignes brutes de la base (sejours : statut,
// pension, arrivee, depart, nb_adultes, nb_enfants ; sejour_liens :
// sejour_id, type, cible_id). Un séjour relié à une réservation non annulée
// et non no-show du même jour et du même service n'est pas compté : ses
// couverts sont déjà dans « Réservés » (une demande en ligne à venir aussi,
// comme dans couvertsParService).
export function pensionParService({ sejours, liens, resas, aujourdhui }) {
  const table = new Map();
  const resaParId = new Map();
  for (const r of resas || []) resaParId.set(String(r.id), r);
  // Séjour -> clés « date|service » déjà couvertes par une réservation reliée.
  const couvertes = new Map();
  for (const l of liens || []) {
    if (l.type !== 'reservation') continue;
    const r = resaParId.get(String(l.cible_id));
    if (!r || r.statut === 'annule' || r.statut === 'no_show') continue;
    const svc = serviceAffiche(r.service);
    if (!SERVICES_AFFICHES.includes(svc)) continue;
    const sid = String(l.sejour_id);
    if (!couvertes.has(sid)) couvertes.set(sid, new Set());
    couvertes.get(sid).add(`${r.date_service}|${svc}`);
  }
  const repasDuService = { midi: 'dejeuner', soir: 'diner' };
  for (let i = 0; i < JOURS_PREVUS; i += 1) {
    const jour = zurichAjouterJours(aujourdhui, i);
    for (const svc of SERVICES_AFFICHES) {
      const repas = repasDuService[svc];
      if (!repas) continue;
      const cle = `${jour}|${svc}`;
      let total = 0;
      for (const s of sejours || []) {
        if (!sejourMange(s, jour, repas)) continue;
        if (couvertes.get(String(s.id))?.has(cle)) continue;
        total += (Number(s.nb_adultes) || 0) + (Number(s.nb_enfants) || 0);
      }
      if (total > 0) table.set(cle, total);
    }
  }
  return table;
}

// Moyenne des mêmes services : le même jour de la semaine, les semaines
// passées, depuis la première réservation de l'établissement.
export function baseService({ jour, service, aujourdhui, premiereDate, realises }) {
  const dates = [];
  for (let k = 1; k <= SEMAINES; k += 1) {
    const d = zurichAjouterJours(jour, -7 * k);
    if (d >= aujourdhui) continue;
    if (!premiereDate || d < premiereDate) break;
    dates.push(d);
  }
  const total = dates.reduce((s, d) => s + (realises.get(`${d}|${service}`) || 0), 0);
  return { semaines: dates.length, moyenne: dates.length ? total / dates.length : null };
}

// Effet mesuré de la météo sur un service (règles plus haut).
export function mesurerEffet({ service, aujourdhui, premiereDate, realises, pluieParJour }) {
  if (!pluieParJour || !pluieParJour.size) {
    return { mesurable: false, raison: 'sans_mesures', nPrecip: 0, nSec: 0 };
  }
  const jours = [];
  for (let k = 1; k <= SEMAINES_EFFET * 7; k += 1) {
    const d = zurichAjouterJours(aujourdhui, -k);
    if (!premiereDate || d < premiereDate) break;
    jours.push(d);
  }
  const parJourSemaine = new Map();
  for (const d of jours) {
    const w = jourSemaine(d);
    const e = parJourSemaine.get(w) || { total: 0, n: 0 };
    e.total += realises.get(`${d}|${service}`) || 0;
    e.n += 1;
    parJourSemaine.set(w, e);
  }
  const precip = [];
  const sec = [];
  for (const d of jours) {
    const pluie = pluieParJour.get(d);
    if (pluie === undefined) continue;
    const e = parJourSemaine.get(jourSemaine(d));
    const moy = e.total / e.n;
    // Un jour de la semaine sans service (fermeture) n'apprend rien.
    if (!(moy > 0)) continue;
    const rapport = (realises.get(`${d}|${service}`) || 0) / moy;
    (pluie >= SEUIL_PRECIP_MM ? precip : sec).push(rapport);
  }
  const comptes = { nPrecip: precip.length, nSec: sec.length };
  if (precip.length < JOURS_MIN_PAR_CLASSE || sec.length < JOURS_MIN_PAR_CLASSE) {
    return { mesurable: false, raison: 'jours_insuffisants', ...comptes };
  }
  const mPrecip = moyenneDe(precip);
  const mSec = moyenneDe(sec);
  const mTous = moyenneDe([...precip, ...sec]);
  const erreurType = Math.sqrt(varianceDe(precip) / precip.length + varianceDe(sec) / sec.length);
  let ecart;
  if (erreurType > 0) ecart = Math.abs(mPrecip - mSec) / erreurType;
  else ecart = mPrecip === mSec ? 0 : Infinity;
  if (ecart < ECART_MIN_ERREURS_TYPES || !(mTous > 0)) {
    return { mesurable: false, raison: 'ecart_non_significatif', ...comptes };
  }
  return {
    mesurable: true,
    raison: null,
    ...comptes,
    // Par rapport à un jour moyen, que la moyenne des mêmes services décrit.
    tauxPrecip: mPrecip / mTous - 1,
    tauxSec: mSec / mTous - 1,
  };
}

// Prévision complète, prête à afficher.
//   resas        : réservations de la fenêtre (passées et à venir), avec
//                  date_service, service, nb_couverts, statut
//   premiereDate : date de la première réservation de l'établissement
//   etatMeteo    : 'sans_localisation' | 'chargement' | 'indisponible' | 'ok'
//   meteo        : sortie de lireMeteo quand etatMeteo vaut 'ok'
//   fermetures   : celles de la maison (Réglages > Horaires et fermetures) ;
//                  un service fermé n'a pas de prévision (etat 'ferme').
//   pension      : sortie de pensionParService, ou null sans cette source.
//                  Hôtes en pension et réservés font ensemble le plancher ;
//                  la pension ne s'ajoute jamais à la moyenne (l'historique
//                  contient peut-être déjà les hôtes placés en passage).
export function construirePrevision({ aujourdhui, premiereDate, resas, meteo = null, etatMeteo, fermetures = null, pension = null }) {
  const liste = resas || [];
  const realises = couvertsParService(liste.filter((r) => r.date_service < aujourdhui), { realise: true });
  const reserves = couvertsParService(liste.filter((r) => r.date_service >= aujourdhui), { realise: false });
  const meteoOk = etatMeteo === 'ok' && meteo ? meteo : null;

  const effets = {};
  for (const svc of SERVICES_AFFICHES) {
    effets[svc] = meteoOk
      ? mesurerEffet({ service: svc, aujourdhui, premiereDate, realises, pluieParJour: meteoOk.historique })
      : { mesurable: false, raison: 'sans_meteo', nPrecip: 0, nSec: 0 };
  }

  const jours = [];
  for (let i = 0; i < JOURS_PREVUS; i += 1) {
    const jour = zurichAjouterJours(aujourdhui, i);
    const classe = meteoOk ? classeDuJour(meteoOk, jour) : null;
    const services = {};
    for (const svc of SERVICES_AFFICHES) {
      const base = baseService({ jour, service: svc, aujourdhui, premiereDate, realises });
      const dejaReserves = reserves.get(`${jour}|${svc}`) || 0;
      const enPension = (pension && pension.get(`${jour}|${svc}`)) || 0;
      const temps = meteoOk ? meteoDuService(meteoOk, jour, svc) : null;
      if (fermetures && maisonFermee(fermetures, jour, svc)) {
        services[svc] = {
          etat: 'ferme', semaines: base.semaines, moyenne: null,
          reserves: dejaReserves, pension: enPension, effet: null, calcul: null, valeur: null, plancher: false, temps,
        };
        continue;
      }
      if (base.semaines < SEMAINES_MIN) {
        services[svc] = {
          etat: 'historique_court', semaines: base.semaines, moyenne: null,
          reserves: dejaReserves, pension: enPension, effet: null, calcul: null, valeur: null, plancher: false, temps,
        };
        continue;
      }
      const e = effets[svc];
      let effet = null;
      if (e.mesurable && classe) {
        const taux = classe === 'precipitations' ? e.tauxPrecip : e.tauxSec;
        if (Math.abs(taux) >= EFFET_MIN) effet = { classe, taux };
      }
      const calcul = Math.round(base.moyenne * (1 + (effet ? effet.taux : 0)));
      const certains = dejaReserves + enPension;
      services[svc] = {
        etat: 'prevision', semaines: base.semaines, moyenne: base.moyenne,
        reserves: dejaReserves, pension: enPension, effet, calcul,
        valeur: Math.max(calcul, certains),
        plancher: certains > calcul,
        temps,
      };
    }
    jours.push({ jour, jourSemaine: jourSemaine(jour), classe, meteoJour: meteoOk?.jours.get(jour) || null, services });
  }

  const semainesMax = Math.max(0, ...jours.flatMap((j) => SERVICES_AFFICHES.map((s) => j.services[s].semaines)));
  return {
    aujourdhui,
    semainesMax,
    statut: semainesMax >= SEMAINES_MIN ? 'prevision' : 'historique_court',
    etatMeteo,
    meteo: meteoOk ? { point: meteoOk.point, station: meteoOk.station } : null,
    effets,
    jours,
  };
}
