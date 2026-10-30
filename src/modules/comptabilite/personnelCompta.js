// ─────────────────────────────────────────────────────────────────────────────
// Coût du personnel de la Comptabilité, sans React ni DOM (testé par node
// --test, personnelCompta.test.mjs). Une estimation pour piloter, jamais une
// fiche de salaire : l'AVS, la LPP et l'impôt à la source restent chez la
// fiduciaire.
//
// Règle D14 de la spec, personne par personne :
//   - salaire mensuel brut (13e salaire compris s'il est coché : montant x
//     13 / 12) au prorata des jours couverts par le salaire, jusqu'à
//     aujourd'hui pour une période en cours (D13), mois par mois comme une
//     charge fixe ;
//   - salaire horaire brut (vacances et jours fériés compris dans le taux)
//     multiplié par les heures du jour où il s'applique ;
//   - charges sociales de l'employeur ajoutées à ces deux salaires (16 % par
//     défaut, réglables) ;
//   - sans salaire saisi : heures multipliées par le coût horaire moyen de la
//     maison, charges déjà comprises ;
//   - sinon « non chiffré » : les heures sont comptées, le coût manque.
// Heures : la mesure du relevé CCNT (calcHeures de planning/soldesHeures.js,
// la seule règle d'heures) ; un horaire passé non pointé compte ses heures
// prévues et le dit ; un horaire qui finit après minuit (durée négative pour
// calcHeures) n'est pas compté et le dit, au lieu d'être soustrait.
// ─────────────────────────────────────────────────────────────────────────────

import { calcHeures } from '../planning/soldesHeures.js';
import { round2 } from '../inventaire/tvaAchats.js';
import { coutSurPeriode } from './chargesFixes.js';

export const CHARGES_SOCIALES_DEFAUT = 16;

const nombre = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

// Salaire qui s'applique un jour donné ; s'il y en a deux, le plus récent.
export function salaireDuJour(salaires, jour) {
  let retenu = null;
  for (const s of salaires || []) {
    if (!s?.debut || s.debut > jour) continue;
    if (s.fin && s.fin < jour) continue;
    if (!retenu || s.debut > retenu.debut) retenu = s;
  }
  return retenu;
}

// Brut d'un mois entier d'un salaire mensuel, 13e salaire compris.
export const mensuelBrut = (s) => (nombre(s?.montant) || 0) * (s?.treizieme === false ? 1 : 13 / 12);

// Heures d'un horaire : pointées (arrivée et départ), sinon prévues pour un
// horaire passé, sinon rien (aujourd'hui pas fini, ou à venir).
//   → { heures, prevues, apresMinuit } ou null
export function heuresHoraire(s, aujourdhui) {
  if (!s?.date) return null;
  const pointe = !!(s.pointageDebut && s.pointageFin);
  let h = null;
  let prevues = false;
  if (pointe) h = calcHeures(s.pointageDebut, s.pointageFin, s.pause);
  else if (s.date < aujourdhui) { h = calcHeures(s.debut, s.fin, s.pause); prevues = true; }
  if (h == null || !Number.isFinite(h)) return null;
  if (h < 0) return { heures: 0, prevues, apresMinuit: true };
  return { heures: h, prevues, apresMinuit: false };
}

const finDe = (fin, aujourdhui) => (fin && fin < aujourdhui ? fin : aujourdhui);
const chevauche = (s, debut, fin) => !!s?.debut && s.debut <= fin && (!s.fin || s.fin >= debut);

//   personnes  : ids des personnes suivies (contrats de la période) ; les
//                personnes qui ont un salaire ou un horaire s'y ajoutent
//   salaires   : salaires estimés de l'établissement (salaires_estimes mappés)
//   shifts     : horaires de la période (mapShiftFromDB : userId, date,
//                debut, fin, pause, pointageDebut, pointageFin)
//   reglages   : { chargesSocialesPct, coutHoraireMoyen }
//   debut, fin : la période ; aujourdhui : jour ISO de Zurich
// → { total, lignes: [{ userId, source, salaire, heures, heuresPrevues,
//     heuresNonChiffrees, apresMinuit, cout }], heures, heuresPrevues,
//     heuresNonChiffrees, sansCout, apresMinuit, chargesPct, coutMoyen,
//     parSource: { mensuel, horaire, moyen, aucun } }
export function coutPersonnel({ personnes = [], salaires = [], shifts = [], reglages = {}, debut, fin, aujourdhui }) {
  const finEff = finDe(fin, aujourdhui);
  const chargesPct = nombre(reglages?.chargesSocialesPct) ?? CHARGES_SOCIALES_DEFAUT;
  const facteur = 1 + chargesPct / 100;
  const coutMoyen = nombre(reglages?.coutHoraireMoyen);
  const coutMoyenUtile = coutMoyen != null && coutMoyen > 0 ? coutMoyen : null;

  const salairesPeriode = (salaires || []).filter(s => s && chevauche(s, debut, finEff));
  const horaires = (shifts || []).filter(s => s?.userId && s.date >= debut && s.date <= finEff);
  const ids = new Set((personnes || []).filter(Boolean));
  salairesPeriode.forEach(s => ids.add(s.profileId));
  horaires.forEach(s => ids.add(s.userId));

  const lignes = [...ids].map((userId) => {
    const sesSalaires = salairesPeriode.filter(s => s.profileId === userId);
    let brut = 0;
    let moyen = 0;
    // Un salaire, ou à défaut le coût moyen, chiffre la personne (0 sans heure).
    const chiffre = sesSalaires.length > 0 || coutMoyenUtile != null;
    // Salaires mensuels : prorata des jours couverts, sans regarder les heures.
    sesSalaires.filter(s => s.mode === 'mensuel').forEach((s) => {
      brut += coutSurPeriode({ montant: mensuelBrut(s), periodicite: 'mensuelle', debut: s.debut, fin: s.fin, tvaTaux: 0 }, debut, finEff).ttc;
    });
    let heures = 0, heuresPrevues = 0, heuresNonChiffrees = 0, apresMinuit = 0;
    horaires.filter(s => s.userId === userId).forEach((s) => {
      const h = heuresHoraire(s, aujourdhui);
      if (!h) return;
      if (h.apresMinuit) { apresMinuit += 1; return; }
      if (h.prevues) heuresPrevues += h.heures; else heures += h.heures;
      const sal = salaireDuJour(sesSalaires, s.date);
      if (sal?.mode === 'horaire') brut += h.heures * (nombre(sal.montant) || 0);
      else if (sal?.mode === 'mensuel') { /* compris dans le mois */ }
      else if (coutMoyenUtile != null) moyen += h.heures * coutMoyenUtile;
      else heuresNonChiffrees += h.heures;
    });
    const salaire = salaireDuJour(sesSalaires, finEff)
      || sesSalaires.slice().sort((a, b) => b.debut.localeCompare(a.debut))[0] || null;
    const source = salaire ? salaire.mode : (coutMoyenUtile != null ? 'moyen' : 'aucun');
    return {
      userId,
      source,
      salaire,
      heures,
      heuresPrevues,
      heuresNonChiffrees,
      apresMinuit,
      cout: chiffre ? round2(brut * facteur + moyen) : null,
    };
  });

  const somme = (k) => lignes.reduce((t, l) => t + (l[k] || 0), 0);
  const chiffrees = lignes.filter(l => l.cout != null);
  const parSource = { mensuel: 0, horaire: 0, moyen: 0, aucun: 0 };
  lignes.forEach((l) => { parSource[l.source] += 1; });
  return {
    total: chiffrees.length ? round2(chiffrees.reduce((t, l) => t + l.cout, 0)) : null,
    lignes,
    heures: somme('heures'),
    heuresPrevues: somme('heuresPrevues'),
    heuresNonChiffrees: somme('heuresNonChiffrees'),
    // Personne dont une part du temps n'a ni salaire ni coût moyen.
    sansCout: lignes.filter(l => l.source === 'aucun' || l.heuresNonChiffrees > 0).length,
    apresMinuit: somme('apresMinuit'),
    chargesPct,
    coutMoyen: coutMoyenUtile,
    parSource,
  };
}
