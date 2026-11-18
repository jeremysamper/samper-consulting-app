// ─────────────────────────────────────────────────────────────────────────────
// Coût prévu du personnel d'une semaine du Planning et sa part du chiffre
// d'affaires, sans React ni base (testé par node, coutPersonnel.test.mjs).
// Lu par la carte « Coût du personnel » de la grille, pour la direction
// seulement (garde des salaires de la Comptabilité).
//
// Coût, personne par personne et jour par jour :
//   heures prévues = travail du jour de journeesDe (conformiteCcnt.js) : pause
//                    déduite, service coupé additionné ;
//   taux horaire   = salaire horaire brut de la Comptabilité (salaires_estimes,
//                    vacances et jours fériés compris dans le taux) ;
//                    salaire mensuel brut (13e salaire compris s'il est coché)
//                    ramené à l'heure : x 12 / 52 / heures de la semaine, celles
//                    du contrat du jour (heures par semaine x taux / 100, la
//                    règle de soldesHeures.js), sinon la durée CCNT de
//                    l'établissement (gardesPlanning.js) ;
//                    sans salaire : le coût horaire moyen de la maison (réglé
//                    dans la Comptabilité, charges déjà comprises) ;
//                    sinon « sans taux » : les heures sont comptées à part et la
//                    personne nommée, jamais chiffrée à zéro ;
//   charges        = le taux de charges sociales de la Comptabilité (16 % par
//                    défaut), ajouté aux salaires ; réglages illisibles : coût
//                    brut, sans charges, dit à l'écran.
//
// Chiffre d'affaires, hors TVA, jour par jour (ventesParJour de la
// Comptabilité : saisie du jour, caisse, notes de séjour) :
//   jour passé     = le chiffre réalisé ; un jour sans chiffre reste
//                    « manquant », jamais zéro ;
//   aujourd'hui et après = la moyenne des mêmes jours de la semaine sur les
//                    4 dernières semaines (les 4 derniers lundis avant
//                    aujourd'hui pour un lundi), sur les jours qui ont un
//                    chiffre ;
//   lecture en échec ou en cours : aucun chiffre, aucune part.
// Part du CA : coût des jours qui ont des heures prévues chiffrées et un
// chiffre (réalisé ou moyen), divisé par le chiffre de ces jours. Un jour dont
// toutes les heures sont sans taux reste hors de la part (« sans taux ») ; un
// jour où une partie l'est y entre, et l'écran dit que les heures sans taux
// n'y sont pas.
// ─────────────────────────────────────────────────────────────────────────────

import { decaler, journeesDe } from './conformiteCcnt.js';
import { contratDuJour } from './soldesHeures.js';
import { mensuelBrut, salaireDuJour } from '../comptabilite/personnelCompta.js';
import { totauxVentes } from '../comptabilite/ventesCompta.js';

export const SEMAINES_MOYENNE = 4;
const SEMAINES_PAR_MOIS = 52 / 12;

const nombre = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
const positif = (v) => { const n = nombre(v); return n != null && n > 0 ? n : null; };
const arrondi = (v) => Math.round(v * 100) / 100;

// Les jours ISO de debut à fin, bornes comprises.
export function joursDe(debut, fin) {
  const out = [];
  for (let j = debut, garde = 0; j <= fin && garde < 400; j = decaler(j, 1), garde += 1) out.push(j);
  return out;
}

// Heures d'une semaine de travail pour ramener un salaire mensuel à l'heure.
export function heuresSemainePour(contrat, heuresEtab) {
  if (contrat) {
    const h = (nombre(contrat.heuresSemaine) || 0) * (nombre(contrat.taux) || 0) / 100;
    if (h > 0) return { heures: h, base: 'contrat' };
  }
  const h = positif(heuresEtab);
  return h ? { heures: h, base: 'ccnt' } : null;
}

// Taux horaire d'une personne un jour donné. salaires et contrats sont ceux de
// la personne.
//   → { taux, source: 'horaire' | 'mensuel' | 'moyen', base? } ou null
export function tauxHoraireDuJour({ salaires = [], contrats = [], jour, heuresEtab, coutMoyen = null }) {
  const sal = salaireDuJour(salaires, jour);
  if (sal?.mode === 'horaire' && positif(sal.montant)) return { taux: Number(sal.montant), source: 'horaire' };
  if (sal?.mode === 'mensuel' && positif(sal.montant)) {
    const semaine = heuresSemainePour(contratDuJour(contrats, jour), heuresEtab);
    if (semaine) return { taux: mensuelBrut(sal) / SEMAINES_PAR_MOIS / semaine.heures, source: 'mensuel', base: semaine.base };
  }
  const moyen = positif(coutMoyen);
  return moyen ? { taux: moyen, source: 'moyen' } : null;
}

// Coût prévu des horaires de `jours`.
//   shifts     : horaires du Planning (userId, date, debut, fin, pause)
//   salaires   : salaires estimés de la Comptabilité (profileId, mode, montant,
//                treizieme, debut, fin)
//   contrats   : contrats de travail (profileId, taux, heuresSemaine, debut, fin)
//   chargesPct : taux de charges de la Comptabilité ; null = coût brut
//   coutMoyen  : coût horaire moyen de la maison (charges comprises) ou null
//   heuresEtab : durée CCNT de la semaine de l'établissement
// → { parJour: { jour: { cout, minutes, minutesSansTaux } }, total, minutes,
//     minutesSansTaux, sansTaux: [{ userId, minutes }], auCoutMoyen: [userId],
//     chargesPct }
export function coutPrevu({ jours = [], shifts = [], salaires = [], contrats = [], chargesPct = null, coutMoyen = null, heuresEtab = 42 }) {
  const dans = new Set(jours);
  const facteur = 1 + (nombre(chargesPct) ?? 0) / 100;
  const parJour = {};
  jours.forEach((j) => { parJour[j] = { cout: 0, minutes: 0, minutesSansTaux: 0 }; });

  const parPersonne = new Map();
  (shifts || []).forEach((s) => {
    if (!s?.userId || !dans.has(s.date)) return;
    if (!parPersonne.has(s.userId)) parPersonne.set(s.userId, []);
    parPersonne.get(s.userId).push(s);
  });

  const sansTaux = [];
  const auCoutMoyen = [];
  for (const [userId, siens] of parPersonne) {
    const sesSalaires = (salaires || []).filter(s => s?.profileId === userId);
    const sesContrats = (contrats || []).filter(c => c?.profileId === userId);
    let minutesSansTaux = 0;
    let moyen = false;
    for (const [jour, journee] of journeesDe(siens)) {
      const minutes = journee.travail;
      if (!minutes || !parJour[jour]) continue;
      parJour[jour].minutes += minutes;
      const t = tauxHoraireDuJour({ salaires: sesSalaires, contrats: sesContrats, jour, heuresEtab, coutMoyen });
      if (!t) {
        parJour[jour].minutesSansTaux += minutes;
        minutesSansTaux += minutes;
        continue;
      }
      if (t.source === 'moyen') moyen = true;
      parJour[jour].cout += (minutes / 60) * t.taux * (t.source === 'moyen' ? 1 : facteur);
    }
    if (minutesSansTaux > 0) sansTaux.push({ userId, minutes: minutesSansTaux });
    if (moyen) auCoutMoyen.push(userId);
  }

  jours.forEach((j) => { parJour[j].cout = arrondi(parJour[j].cout); });
  const somme = (k) => jours.reduce((t, j) => t + parJour[j][k], 0);
  return {
    parJour,
    total: arrondi(somme('cout')),
    minutes: somme('minutes'),
    minutesSansTaux: somme('minutesSansTaux'),
    sansTaux: sansTaux.sort((a, b) => b.minutes - a.minutes),
    auCoutMoyen,
    chargesPct: nombre(chargesPct),
  };
}

// Les `n` mêmes jours de la semaine que `jour`, les plus récents avant
// `aujourdhui` (exclu), du plus récent au plus ancien.
export function memesJoursAvant(jour, aujourdhui, n = SEMAINES_MOYENNE) {
  const ecart = ((Date.parse(`${aujourdhui}T12:00:00Z`) - Date.parse(`${jour}T12:00:00Z`)) / 86400000) % 7;
  const recul = ((ecart % 7) + 7) % 7 || 7;
  const premier = decaler(aujourdhui, -recul);
  return Array.from({ length: n }, (_, i) => decaler(premier, -7 * i));
}

// Chiffre d'affaires hors TVA de `jours`.
//   ventes        : lignes de ventesParJour (Comptabilité), lues sur une
//                   fenêtre qui couvre les 4 semaines avant aujourd'hui
//   statut        : 'ready' | 'loading' | 'error' (état de la lecture)
//   notesCouvrent : un hôtel sans saisie ni caisse, dont les notes de séjour
//                   font tout le chiffre (notesCouvrentJours)
// → { statut, parJour: { jour: { ht, base: 'realise' | 'moyenne' | 'manquant'
//     | 'sans_moyenne', semaines? } } } ; parJour vide hors de 'ready'.
export function caPrevu({ jours = [], ventes = [], statut = 'ready', aujourdhui, notesCouvrent = false }) {
  if (statut !== 'ready') return { statut, parJour: {} };
  const connus = new Map();
  (ventes || []).forEach((v) => {
    if (v?.jour && (v.source || (notesCouvrent && v.avecNotes))) connus.set(v.jour, totauxVentes([v]).ht);
  });
  const parJour = {};
  jours.forEach((j) => {
    if (j < aujourdhui) {
      parJour[j] = connus.has(j) ? { ht: connus.get(j), base: 'realise' } : { ht: null, base: 'manquant' };
      return;
    }
    const valeurs = memesJoursAvant(j, aujourdhui).filter(d => connus.has(d)).map(d => connus.get(d));
    parJour[j] = valeurs.length
      ? { ht: arrondi(valeurs.reduce((t, v) => t + v, 0) / valeurs.length), base: 'moyenne', semaines: valeurs.length }
      : { ht: null, base: 'sans_moyenne' };
  });
  return { statut, parJour };
}

const AVEC_CHIFFRE = new Set(['realise', 'moyenne']);

// Part du CA, par jour et sur la semaine.
// → { statut, parJour: { jour: { cout, minutes, minutesSansTaux, ht, base,
//     semaines, part, raison } }, total: { cout, ht, coutBase, part, raison },
//     joursSansCa: [jour], bases: { realise, moyenne } }
// raison (part null) : 'chargement' | 'ca_non_lu' | 'sans_horaire' |
// 'sans_taux' | 'sans_ca' | 'ca_nul'.
export function partDuCa({ jours = [], cout, ca }) {
  const statut = ca?.statut || 'loading';
  const raisonLecture = statut === 'error' ? 'ca_non_lu' : statut === 'ready' ? null : 'chargement';
  const parJour = {};
  const joursSansCa = [];
  const bases = { realise: 0, moyenne: 0 };
  let coutBase = 0;
  let ht = 0;
  let joursComptes = 0;
  jours.forEach((j) => {
    const c = cout?.parJour?.[j] || { cout: 0, minutes: 0, minutesSansTaux: 0 };
    const v = ca?.parJour?.[j] || { ht: null, base: null };
    const ligne = { ...c, ht: v.ht, base: v.base, semaines: v.semaines ?? null, part: null, raison: null };
    if (raisonLecture) ligne.raison = raisonLecture;
    else if (!c.minutes) ligne.raison = 'sans_horaire';
    // Aucune heure chiffrée ce jour-là : une part de 0 % mentirait.
    else if (c.minutesSansTaux >= c.minutes) ligne.raison = 'sans_taux';
    else if (!AVEC_CHIFFRE.has(v.base)) { ligne.raison = 'sans_ca'; joursSansCa.push(j); }
    else {
      bases[v.base] += 1;
      joursComptes += 1;
      coutBase += c.cout;
      ht += v.ht;
      if (v.ht > 0) ligne.part = c.cout / v.ht;
      else ligne.raison = 'ca_nul';
    }
    parJour[j] = ligne;
  });

  const total = { cout: cout?.total ?? null, ht: null, coutBase: arrondi(coutBase), part: null, raison: null };
  if (raisonLecture) total.raison = raisonLecture;
  else if (!cout?.minutes) total.raison = 'sans_horaire';
  else if (!joursComptes) total.raison = joursSansCa.length ? 'sans_ca' : 'sans_taux';
  else {
    total.ht = arrondi(ht);
    if (ht > 0) total.part = coutBase / ht;
    else total.raison = 'ca_nul';
  }
  return { statut, parJour, total, joursSansCa, bases };
}
