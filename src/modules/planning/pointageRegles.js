// ─────────────────────────────────────────────────────────────────────────────
// Heures pointées retenues (18.11.2026) : la seule mesure des heures pointées
// de l'app. Soldes, relevé CCNT, exports, Comptabilité et Statistiques la
// lisent toutes ; le pointage brut n'est jamais réécrit et reste affiché, le
// module Points lit toujours le brut.
//
// Règles (Réglages > Planning > Pointage, reglages_maison.pointage) :
//   avance      'pointee' : l'arrivée compte dès le pointage (calcul d'avant) ;
//               'prevue'  : une arrivée pointée avant l'heure prévue compte
//               dès l'heure prévue (jamais l'inverse : un retard reste) ;
//   arrondiMin  0, 5 ou 15 : arrivée et départ arrondis au plus proche, dans
//               les deux sens, donc juste en moyenne.
// Un départ clos d'office (clore_pointages_oublies, réglage clotureAutoH)
// compte comme un départ à l'heure de fin prévue ; closDOffice le signale à
// l'écran jusqu'au départ réel ou à la correction.
// Sans règle connue pour l'établissement (réglages pas encore lus, ou jamais
// touchés) : les défauts, soit le calcul d'avant à la minute près.
//
// Les règles de l'établissement sont retenues par useReglagesMaison à chaque
// lecture (retenirReglesPointage, utils/reglagesMaison.js) : un écran qui
// affiche des heures pointées monte ce hook, et se redessine quand elles
// arrivent. Pur, testé par pointageRegles.test.mjs.
// ─────────────────────────────────────────────────────────────────────────────

import { dureeMinutes } from './dureeHoraire.js';
import { reglesPointagePour } from '../../utils/reglagesMaison.js';

const enMinutes = (t) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t ?? ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const versHeure = (min) => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
const arrondir = (min, pas) => (pas ? Math.round(min / pas) * pas : min);

// Départ posé par la clôture d'office, pas pointé (shifts.pointage_fin_auto).
export const LIBELLE_CLOS_D_OFFICE = "Départ non pointé, clos d'office";
export const closDOffice = (s) => Boolean(s?.pointageFin && s?.pointageFinAuto === true);

// Arrivée et départ retenus d'un horaire pointé, ou null s'il manque un
// pointage. Une avance de plus de 6 h n'est pas une avance (horaire de nuit
// mal lu) : elle reste telle quelle.
export function bornesRetenues(s, regles = reglesPointagePour(s?.etablissementId)) {
  if (!s?.pointageDebut || !s?.pointageFin) return null;
  let debut = enMinutes(s.pointageDebut);
  let fin = enMinutes(s.pointageFin);
  if (debut == null || fin == null) return null;
  const prevu = enMinutes(s.debut);
  if (regles?.avance === 'prevue' && prevu != null && debut < prevu && prevu - debut <= 360) debut = prevu;
  debut = arrondir(debut, regles?.arrondiMin || 0);
  fin = arrondir(fin, regles?.arrondiMin || 0);
  return { debut: versHeure(debut), fin: versHeure(fin) };
}

// Heures pointées retenues, pause déduite ; null s'il manque un pointage.
export function heuresPointees(s, regles) {
  const b = bornesRetenues(s, regles === undefined ? reglesPointagePour(s?.etablissementId) : regles);
  if (!b) return null;
  const m = dureeMinutes(b.debut, b.fin, s.pause);
  return m == null ? null : m / 60;
}
