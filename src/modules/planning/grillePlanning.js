// ─────────────────────────────────────────────────────────────────────────────
// Chiffres de la grille du Planning (lot L5), sans React ni base : testé par
// node (grillePlanning.test.mjs).
//
//   servicesAPourvoir : la ligne « À pourvoir » en tête de grille. Un horaire
//                       y monte quand sa personne est absente ce jour-là
//                       (absence acceptée) ou quand il est proposé à
//                       l'échange et que personne ne l'a encore repris. Il
//                       reste aussi dans la ligne de sa personne : la grille
//                       ne déplace rien, elle signale.
//   heuresParJour     : le pied « Total du jour », heures prévues des lignes
//                       affichées, mesure du relevé CCNT (calcHeures).
//   heuresDues        : sous chaque nom, les heures du contrat sur la période
//                       affichée (règle de soldesHeures.js : jours d'absence
//                       créditée déduits), sinon la durée CCNT de
//                       l'établissement, dite comme telle.
// ─────────────────────────────────────────────────────────────────────────────

import { couvre, estAcceptee } from '../../utils/absences.js';
import { calcHeures, joursEntre, soldePersonne } from './soldesHeures.js';

const parHeure = (a, b) => (a.shift.debut || '').localeCompare(b.shift.debut || '');

// → { [date]: [{ shift, raison: 'absence' | 'echange', echangeId? }] }
export function servicesAPourvoir({ shifts = [], absences = [], echanges = [], dates = [] }) {
  const out = {};
  dates.forEach((d) => { out[d] = []; });
  const proposes = new Map(
    (echanges || []).filter((e) => e && e.statut === 'propose').map((e) => [e.shift_id, e]),
  );
  const acceptees = (absences || []).filter(estAcceptee);
  for (const s of shifts || []) {
    if (!s || !out[s.date]) continue;
    if (s.debut && s.debut === s.fin) continue;
    if (acceptees.some((a) => a.userId === s.userId && couvre(a, s.date))) {
      out[s.date].push({ shift: s, raison: 'absence' });
      continue;
    }
    const e = proposes.get(s.id);
    if (e) out[s.date].push({ shift: s, raison: 'echange', echangeId: e.id });
  }
  dates.forEach((d) => out[d].sort(parHeure));
  return out;
}

export const nombreAPourvoir = (parJour) => Object.values(parJour || {}).reduce((t, l) => t + l.length, 0);

// → { [date]: heures } pour les personnes de userIds (Set ; null = toutes).
export function heuresParJour({ shifts = [], userIds = null, dates = [] }) {
  const out = {};
  dates.forEach((d) => { out[d] = 0; });
  for (const s of shifts || []) {
    if (!s || !(s.date in out)) continue;
    if (userIds && !userIds.has(s.userId)) continue;
    const h = Number(calcHeures(s.debut, s.fin, s.pause));
    if (Number.isFinite(h) && h > 0) out[s.date] += h;
  }
  return out;
}

// Heures dues d'une personne sur [debut, fin].
// → { heures, base: 'contrat' | 'ccnt' } ou null (ni contrat ni durée CCNT)
export function heuresDues({ userId, debut, fin, contrats = [], absences = [], heuresSemaineEtab = null }) {
  if (!debut || !fin) return null;
  const s = soldePersonne({ userId, debut, fin, contrats, shifts: [], absences: (absences || []).filter(estAcceptee) });
  if (s.avecContrat) return { heures: s.heuresDues, base: 'contrat' };
  const h = Number(heuresSemaineEtab);
  const jours = joursEntre(debut, fin).length;
  return h > 0 && jours ? { heures: (h * jours) / 7, base: 'ccnt' } : null;
}

// Teinte du total sous le nom : sous 80 % des heures dues (gris), jusqu'à
// 100 % (lien), au-delà (heures supplémentaires, alerte). La règle d'avant,
// comparée maintenant aux heures du contrat quand il existe.
export function teinteHeures(prevues, dues) {
  if (!dues || !(dues > 0) || !prevues) return 'var(--text2)';
  const r = prevues / dues;
  if (r < 0.8) return 'var(--text2)';
  if (r <= 1.0001) return 'var(--lien)';
  return 'var(--warning-text)';
}
