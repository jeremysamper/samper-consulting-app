// ─────────────────────────────────────────────────────────────────────────────
// Demandes de congé (lot L5), sans React ni base : testé par node
// (demandesConge.test.mjs).
//
// Un employé demande un congé depuis Mon planning ; la ligne naît en
// 'demande' dans la table absences. Qui gère le planning l'accepte ou la
// refuse dans la colonne « À traiter » ; acceptée, elle devient une absence
// comme celles que la direction pose (grille, tableau de bord, soldes).
// Les gardes vivent en base (RLS de 20261122_absences_demandes_conge.sql) ;
// ces règles ne servent qu'à dire tôt, à l'écran, ce que la base refuserait.
// ─────────────────────────────────────────────────────────────────────────────

import { couvre, estAcceptee } from '../../utils/absences.js';
import { joursEntre } from './soldesHeures.js';

// Ce qu'un employé peut demander. « Absence » (maladie, raison personnelle)
// et « Jour férié » restent posés par la direction.
export const MOTIFS_DEMANDE = ['conge', 'vacances', 'formation'];

// « demande un congé », « demande des vacances », « demande une formation » :
// chaque phrase reste une entrée du glossaire.
export const PHRASE_DEMANDE = {
  conge: 'demande un congé',
  vacances: 'demande des vacances',
  formation: 'demande une formation',
};

export const LIBELLE_STATUT = {
  demande: 'En attente',
  acceptee: 'Acceptée',
  refusee: 'Refusée',
};

const DUREE_MAX_JOURS = 367; // absences_duree_max : date_fin - date_debut <= 366

// Deux périodes [debut, fin] se chevauchent-elles ? (bornes incluses)
const chevauche = (a, debut, fin) => a.dateDebut <= fin && a.dateFin >= debut;

// Ce qui empêche d'envoyer la demande, ou null.
//   lignes : les lignes de la personne que la RLS rend (absences, demandes,
//            refus) ; un refus ne bloque pas une nouvelle demande.
export function verifierDemande({ motif, dateDebut, dateFin, aujourdhui, userId, lignes = [] }) {
  if (!MOTIFS_DEMANDE.includes(motif)) return 'Choisissez un motif.';
  if (!dateDebut || !dateFin) return 'Indiquez les dates.';
  if (dateDebut < aujourdhui) return 'Un congé se demande pour aujourd\'hui ou plus tard.';
  if (dateFin < dateDebut) return 'La date de fin doit être le même jour ou après la date de début.';
  if (joursEntre(dateDebut, dateFin).length > DUREE_MAX_JOURS) return 'Une demande couvre un an au plus.';
  const deja = lignes.find((a) => a.userId === userId && a.statut !== 'refusee' && chevauche(a, dateDebut, dateFin));
  if (deja) {
    return deja.statut === 'demande'
      ? 'Vous avez déjà une demande en attente sur ces jours.'
      : 'Vous avez déjà une absence sur ces jours.';
  }
  return null;
}

// Les lignes de la personne encore à venir (fin aujourd'hui ou plus tard),
// de la plus proche à la plus lointaine : demandes, absences acceptées, refus.
export function mesDemandes({ lignes = [], userId, aujourdhui }) {
  return lignes
    .filter((a) => a.userId === userId && a.dateFin >= aujourdhui)
    .sort((a, b) => a.dateDebut.localeCompare(b.dateDebut) || (a.createdAt || '').localeCompare(b.createdAt || ''));
}

// Ce que la personne qui décide doit savoir d'une demande :
//   autresAbsents : les autres personnes déjà absentes (acceptées) un de ces
//                   jours, une fois chacune ;
//   services      : les horaires de la personne ces jours-là (ils passeront
//                   « à pourvoir » si la demande est acceptée) ;
//   jours         : le nombre de jours demandés.
export function contexteDemande({ demande, absences = [], shifts = [] }) {
  const jours = joursEntre(demande.dateDebut, demande.dateFin);
  const dans = new Set(jours);
  const autresAbsents = [...new Set(
    absences
      .filter((a) => estAcceptee(a) && a.userId !== demande.userId && jours.some((j) => couvre(a, j)))
      .map((a) => a.userId),
  )];
  const services = shifts
    .filter((s) => s.userId === demande.userId && dans.has(s.date))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.debut || '').localeCompare(b.debut || ''));
  return { autresAbsents, services, jours: jours.length };
}

// Demandes ouvertes, la plus ancienne d'abord (premier arrivé, premier servi).
export const demandesATraiter = (demandes = []) => demandes
  .filter((a) => a.statut === 'demande')
  .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '') || a.dateDebut.localeCompare(b.dateDebut));
