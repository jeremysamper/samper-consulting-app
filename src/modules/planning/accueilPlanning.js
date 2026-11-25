// ─────────────────────────────────────────────────────────────────────────────
// Chiffres de l'accueil du Planning (direction Galet), fonctions pures testées
// par accueilPlanning.test.mjs. Elles ne lisent que les horaires déjà chargés
// par l'écran (planningVisible, filtré comme l'équipe du jour).
//
// equipeParEtat : l'équipe d'un jour comptée en personnes, par état de
// pointage, avec la règle de la carte « L'équipe aujourd'hui » du tableau de
// bord : l'horaire en cours, sinon le prochain non pointé, sinon le dernier.
//   en_poste   arrivée pointée, départ non pointé
//   termine    arrivée et départ pointés
//   en_retard  rien de pointé, début passé de plus de 15 minutes
//   attendu    rien de pointé, début à venir (ou dans les 15 minutes)
// Une personne en service coupé compte une fois.
//
// heuresPrevues : la somme des durées des horaires donnés, pause déduite, par
// la seule règle de l'app (dureeHoraire.js). Un horaire sans heure lisible ne
// compte pas.
// ─────────────────────────────────────────────────────────────────────────────
import { dureeMinutes } from './dureeHoraire.js';

export const RETARD_POINTAGE_MIN = 15;

const enMinutes = (t) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t ?? ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

function etatHoraire(s, maintenant) {
  if (s.pointageDebut && s.pointageFin) return 'termine';
  if (s.pointageDebut) return 'en_poste';
  const debut = enMinutes(s.debut);
  if (debut != null && maintenant - debut > RETARD_POINTAGE_MIN) return 'en_retard';
  return 'attendu';
}

export function equipeParEtat(horaires, maintenant) {
  const parPersonne = new Map();
  [...(horaires || [])]
    .sort((a, b) => (a.debut || '').localeCompare(b.debut || ''))
    .forEach((s) => {
      if (!parPersonne.has(s.userId)) parPersonne.set(s.userId, []);
      parPersonne.get(s.userId).push(s);
    });
  const comptes = { total: parPersonne.size, en_poste: 0, attendu: 0, en_retard: 0, termine: 0 };
  parPersonne.forEach((liste) => {
    const actif = liste.find((s) => s.pointageDebut && !s.pointageFin)
      || liste.find((s) => !s.pointageDebut)
      || liste[liste.length - 1];
    comptes[etatHoraire(actif, maintenant)] += 1;
  });
  return comptes;
}

// Service d'un horaire : le type posé au planning, sinon l'heure de début
// (avant 16 h, le midi). Même règle que le tableau de bord.
export function serviceDeHoraire(s) {
  if (s?.typeShift === 'midi' || s?.typeShift === 'soir') return s.typeShift;
  const debut = enMinutes(s?.debut);
  return debut == null || debut < 16 * 60 ? 'midi' : 'soir';
}

// Service dont parlent la carte et les chiffres de l'équipe du jour : celui en
// cours (quelqu'un en poste, ou pas pointé alors que l'horaire court encore),
// sinon le prochain, sinon le dernier. null sans horaire. « 7 pointés sur 7 »
// (le midi) à côté de « 0 en poste, 7 attendus » (le soir) se contredisaient.
export function serviceDuJour(horaires, maintenant) {
  const tries = [...(horaires || [])].sort((a, b) => (a.debut || '').localeCompare(b.debut || ''));
  if (!tries.length) return null;
  const court = (s) => { const fin = enMinutes(s.fin); return fin == null || fin > maintenant; };
  const enCours = tries.find((s) => (s.pointageDebut && !s.pointageFin) || (!s.pointageDebut && etatHoraire(s, maintenant) === 'en_retard' && court(s)));
  if (enCours) return serviceDeHoraire(enCours);
  const prochain = tries.find((s) => !s.pointageDebut && etatHoraire(s, maintenant) === 'attendu');
  return serviceDeHoraire(prochain || tries[tries.length - 1]);
}

export function heuresPrevues(horaires) {
  const minutes = (horaires || []).reduce((t, s) => t + (dureeMinutes(s.debut, s.fin, s.pause) || 0), 0);
  return minutes / 60;
}
