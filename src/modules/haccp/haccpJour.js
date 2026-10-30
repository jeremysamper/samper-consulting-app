// ═══════════════════════════════════════════════════════════════
// HACCP « premier jour » : l'état de la journée en fonctions pures.
// ═══════════════════════════════════════════════════════════════
// Ce que la carte « Maintenant », le programme du jour, le relevé guidé et
// les contrôles disent à quelqu'un qui arrive : quoi faire maintenant, ce qui
// est en retard, si un chiffre est bon, quoi faire s'il ne l'est pas. Aucun
// import React : testé par haccpJour.test.mjs (node --test).
//
// La conformité reste celle de HACCP.utils.js (isReleveConforme), le
// rattachement d'un relevé à une tournée aussi (créneau le plus proche) :
// rien ici ne redéfinit une règle qui existait déjà.
// ═══════════════════════════════════════════════════════════════

import {
  creneauLePlusProche, heureEnMinutes, isReleveConforme, parseHaccpNumber, suiviDesTournees, trierCreneaux,
} from './HACCP.utils.js';
import { ACTION_AUTRE, ACTIONS_CORRECTIVES } from './HACCP.constants.js';

// Une tournée est « en retard » 30 min après son heure si elle n'est pas
// complète : même seuil que RETARD_RELEVE_MIN du tableau de bord
// (src/modules/dashboard/tableauLogique.js), recopié et non importé pour que
// les deux écrans ne dépendent pas l'un de l'autre. Si le tableau de bord
// change son seuil, réaligner celui-ci : les deux écrans doivent dire la même
// chose au même moment.
export const RETARD_TOURNEE_MIN = 30;
// Une tournée devient « à faire » 30 min avant son heure.
export const AVANCE_TOURNEE_MIN = 30;

// Suivi de chaque tournée à une heure donnée (minutes depuis minuit) :
// zones faites (rattachées par le créneau le plus proche), total et état
// fait | en_retard | a_faire | plus_tard.
export function etatTournees(creneauxActifsTries, zonesActives, relevesDuJour, maintenantMin) {
  return suiviDesTournees(creneauxActifsTries, zonesActives, relevesDuJour).map(t => {
    const h = heureEnMinutes(t.heure) ?? 0;
    let etat;
    if (t.total > 0 && t.faites >= t.total) etat = 'fait';
    else if (maintenantMin >= h + RETARD_TOURNEE_MIN) etat = 'en_retard';
    else if (maintenantMin >= h - AVANCE_TOURNEE_MIN) etat = 'a_faire';
    else etat = 'plus_tard';
    return { ...t, etat };
  });
}

// État de la journée pour la carte « Maintenant ».
//   statut : non_regle (aucune zone active) | a_faire | en_retard | a_jour | manque
//   courante : la tournée du créneau le plus proche de maintenant ;
//   prochaine : la prochaine tournée à venir pas encore faite (la courante
//     elle-même quand elle est encore « plus tard ») ;
//   manquees : tournées passées incomplètes, hors courante ;
//   faitsJour / totalJour : relevés de tournée du jour (zones x tournées) ;
//   sans tournée : zonesFaitesJour et dernierReleve (heure du dernier relevé
//     du jour sur une zone active).
export function etatDuJour({ creneaux, zones, releves, today, maintenant }) {
  const zonesActives = (zones || []).filter(z => z.actif);
  const relevesDuJour = (releves || []).filter(r => r.date === today);
  const idsActifs = new Set(zonesActives.map(z => z.id));
  const duJourActifs = relevesDuJour.filter(r => idsActifs.has(r.zoneId));
  const zonesFaitesJour = new Set(duJourActifs.map(r => r.zoneId)).size;
  const dernierReleve = duJourActifs.map(r => String(r.heure || '').slice(0, 5)).sort().pop() || null;
  const base = {
    statut: 'non_regle', courante: null, prochaine: null, manquees: [], tournees: [],
    faitsJour: 0, totalJour: 0, zonesFaitesJour, totalZones: zonesActives.length, dernierReleve,
  };
  if (!zonesActives.length) return base;

  const actifs = trierCreneaux((creneaux || []).filter(c => c.actif));
  if (!actifs.length) {
    return { ...base, statut: zonesFaitesJour >= zonesActives.length ? 'a_jour' : 'a_faire' };
  }

  const maintenantMin = heureEnMinutes(maintenant) ?? 0;
  const tournees = etatTournees(actifs, zonesActives, relevesDuJour, maintenantMin);
  const proche = creneauLePlusProche(actifs, maintenant);
  const courante = tournees.find(t => t.id === proche?.id) || tournees[0];
  const manquees = tournees.filter(t => t.etat === 'en_retard' && t.id !== courante.id);
  const prochaine = tournees.find(t =>
    (heureEnMinutes(t.heure) ?? 0) > maintenantMin && t.etat !== 'fait'
    && (t.id !== courante.id || courante.etat === 'plus_tard')) || null;

  let statut;
  if (courante.etat === 'a_faire') statut = 'a_faire';
  else if (courante.etat === 'en_retard') statut = 'en_retard';
  else statut = manquees.length ? 'manque' : 'a_jour';

  return {
    ...base, statut, courante, prochaine, manquees, tournees,
    faitsJour: tournees.reduce((s, t) => s + t.faites, 0),
    totalJour: zonesActives.length * tournees.length,
  };
}

// Plage d'une zone pour l'affichage : entre (min et max), au_moins (min
// seul), au_plus (max seul), libre (aucune borne). Bornes inversées : même
// échange que isReleveConforme.
export function plageEnClair(zone) {
  const lire = (v) => (v === null || v === undefined || v === '' ? NaN : parseHaccpNumber(v));
  let min = lire(zone?.min);
  let max = lire(zone?.max);
  if (!Number.isNaN(min) && !Number.isNaN(max) && min > max) [min, max] = [max, min];
  const unite = zone?.unite || '°C';
  const aMin = !Number.isNaN(min);
  const aMax = !Number.isNaN(max);
  const cle = aMin && aMax ? 'entre' : aMin ? 'au_moins' : aMax ? 'au_plus' : 'libre';
  return { cle, min: aMin ? min : null, max: aMax ? max : null, unite };
}

// Types de zone dont on attend du chaud : en dessous, « Pas assez chaud ».
const TYPES_CHAUDS = new Set(['chaud', 'four', 'friture', 'hygiene']);

// Verdict d'un chiffre en mots : { ton: 'ok' | 'danger', mot, sens: 'haut' | 'bas' | null },
// null si le chiffre n'est pas lisible. Conformité par isReleveConforme.
export function verdictReleve(zone, valeur) {
  const conforme = isReleveConforme(zone, valeur);
  if (conforme === null) return null;
  if (conforme) return { ton: 'ok', mot: 'Bon', sens: null };
  const v = parseHaccpNumber(valeur);
  const { max } = plageEnClair(zone);
  const sens = max !== null && v > max ? 'haut' : 'bas';
  const unite = String(zone?.unite || '°C').trim();
  let mot;
  if (unite === '°C' || unite === '°F') {
    if (sens === 'haut') mot = 'Trop chaud';
    else mot = TYPES_CHAUDS.has(zone?.type) ? 'Pas assez chaud' : 'Trop froid';
  } else {
    mot = sens === 'haut' ? 'Trop haut' : 'Trop bas';
  }
  return { ton: 'danger', mot, sens };
}

// Actions proposées quand un chiffre sort de la plage, selon le type de zone
// et le sens de l'écart (HACCP.constants.js).
export function actionsProposees(zone, sens) {
  const type = zone?.type;
  if (type === 'froid' || type === 'negatif') return ACTIONS_CORRECTIVES[sens === 'bas' ? 'froid_bas' : 'froid_haut'];
  if (type === 'chaud' || type === 'four' || type === 'friture') return ACTIONS_CORRECTIVES[sens === 'haut' ? 'chaud_haut' : 'chaud_bas'];
  if (type === 'hygiene') return ACTIONS_CORRECTIVES.hygiene;
  return ACTIONS_CORRECTIVES.autre;
}

// Commentaire écrit avec le relevé : les actions choisies jointes par « . »,
// puis le texte libre ; « Autre chose » n'est jamais écrit lui-même.
export function commentaireActions(choisies = [], texteLibre = '') {
  const parts = (choisies || []).filter(a => a && a !== ACTION_AUTRE);
  const libre = String(texteLibre || '').trim();
  if (libre) parts.push(libre);
  return parts.join('. ');
}

// Décale une date YYYY-MM-DD de n jours (calendrier, sans fuseau).
function ajouterJours(dateStr, n) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// Contrôles « quand il y a lieu » : jamais à faire, on montre la dernière fois.
const FREQ_OCCASIONNELLES = new Set(['À chaque livraison', 'Sur demande']);
// Fenêtre glissante (jours, aujourd'hui compris) des contrôles espacés.
const FENETRES = { Hebdomadaire: 7, Mensuel: 30 };

// État d'un contrôle à une date : { du, fait, dernier }.
//   Hebdomadaire : fait s'il y en a un dans les 7 derniers jours (aujourd'hui
//   compris), Mensuel dans les 30 ; À chaque livraison et Sur demande ne sont
//   jamais dus ; tout le reste (Quotidien, 2× / jour, Avant ou Après chaque
//   service, Début de service, libellé inconnu) : fait s'il y en a un ce jour.
// dernier : l'enregistrement le plus récent jusqu'à cette date comprise.
export function etatControle(tpl, controls, today) {
  const siens = (controls || [])
    .filter(c => c.templateId === tpl.id && c.date && c.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date) || String(b.heure || '').localeCompare(String(a.heure || '')));
  const dernier = siens[0] || null;
  if (FREQ_OCCASIONNELLES.has(tpl.frequence)) return { du: false, fait: false, dernier };
  const jours = FENETRES[tpl.frequence] || 1;
  const debut = ajouterJours(today, -(jours - 1));
  return { du: true, fait: !!dernier && dernier.date >= debut, dernier };
}

// Compteur de la tuile : contrôles actifs dus, et combien sont faits.
export function compteControles(tpls, controls, today) {
  let faits = 0;
  let dus = 0;
  (tpls || []).filter(t => t.actif).forEach(t => {
    const e = etatControle(t, controls, today);
    if (!e.du) return;
    dus += 1;
    if (e.fait) faits += 1;
  });
  return { faits, dus };
}
