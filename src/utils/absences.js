// ═══════════════════════════════════════════════════════════════════════════
// Absences de l'équipe : motifs et lecture « qui est absent tel jour ».
//
// Source unique pour le Planning (saisie, grille) et le tableau de bord. Les ids
// sont ceux de la contrainte CHECK de la migration 20260929 : en ajouter un ici
// sans toucher à la base ferait échouer l'enregistrement.
//
// « Absence » couvre volontairement maladie, accident ou raison personnelle sans
// la nommer : la ligne est lue par toute l'équipe.
// ═══════════════════════════════════════════════════════════════════════════

import { parseLocalDate } from './dateHelpers.js';

export const MOTIFS_ABSENCE = [
  { id: 'conge',     label: 'Congé',     etat: 'en congé',     fond: 'var(--info-bg)',    texte: 'var(--info-text)',    bordure: 'var(--info-bd)' },
  { id: 'formation', label: 'Formation', etat: 'en formation', fond: 'var(--accent-light)', texte: 'var(--accent)',    bordure: 'var(--accent-bd)' },
  { id: 'absence',   label: 'Absence',   etat: 'absence',       fond: 'var(--surface2)',   texte: 'var(--text2)',        bordure: 'var(--border2)' },
];

const PAR_ID = MOTIFS_ABSENCE.reduce((acc, m) => { acc[m.id] = m; return acc; }, {});
export const metaMotif = (id) => PAR_ID[id] || PAR_ID.absence;

export function mapAbsenceFromDB(row) {
  if (!row) return null;
  return {
    id: row.id,
    etablissementId: row.etablissement_id,
    userId: row.user_id,
    motif: row.motif || 'absence',
    dateDebut: row.date_debut,
    dateFin: row.date_fin,
    createdBy: row.created_by || null,
    createdAt: row.created_at || null,
  };
}

// L'absence couvre-t-elle ce jour ? (dates ISO, bornes incluses)
export const couvre = (a, dateISO) => Boolean(a && dateISO && a.dateDebut <= dateISO && a.dateFin >= dateISO);

export const absencesDuJour = (absences, dateISO) => (absences || []).filter((a) => couvre(a, dateISO));

export const absenceDe = (absences, userId, dateISO) =>
  (absences || []).find((a) => a.userId === userId && couvre(a, dateISO)) || null;

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

// « 4 octobre », « 1er mai »
export function jourMois(dateISO) {
  const d = parseLocalDate(dateISO);
  if (!d) return '';
  const jour = d.getDate();
  return `${jour === 1 ? '1er' : jour} ${MOIS[d.getMonth()]}`;
}

// Période lisible : « le 4 octobre », « du 4 au 12 octobre », « du 28 septembre au 3 octobre »
export function periodeAbsence(a) {
  if (!a) return '';
  if (a.dateDebut === a.dateFin) return `le ${jourMois(a.dateDebut)}`;
  const d = parseLocalDate(a.dateDebut);
  const f = parseLocalDate(a.dateFin);
  if (d && f && d.getMonth() === f.getMonth() && d.getFullYear() === f.getFullYear()) {
    return `du ${d.getDate() === 1 ? '1er' : d.getDate()} au ${jourMois(a.dateFin)}`;
  }
  return `du ${jourMois(a.dateDebut)} au ${jourMois(a.dateFin)}`;
}

// Ce qu'il reste de l'absence vue depuis un jour : « jusqu'au 4 octobre »,
// « aujourd'hui seulement », ou la période complète si elle n'a pas commencé.
export function resteAbsence(a, aujourdhuiISO) {
  if (!a) return '';
  if (a.dateDebut > aujourdhuiISO) return periodeAbsence(a);
  if (a.dateFin === aujourdhuiISO) return "aujourd'hui";
  return `jusqu'au ${jourMois(a.dateFin)}`;
}
