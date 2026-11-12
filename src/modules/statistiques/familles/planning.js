// Famille Planning et pointage du catalogue des Statistiques : chaque mesure
// lit un chiffre rendu par serieHeures (planning/soldesHeures.js), la mesure
// de la grille du Planning, du relevé CCNT et du solde. Sans React ni service.
//
// Accès : la grille (« La semaine de l'équipe ») et les pointages du jour
// (« L'équipe aujourd'hui ») s'ouvrent à qui ouvre le Planning ; le solde
// d'heures selon le contrat reste à la direction (`reserve`), comme les
// chiffres de la direction et l'export salaires.
// Une tranche sans horaire vaut « n/a » pour les heures, jamais 0.

import { serieHeures } from '../../planning/soldesHeures.js';
import { MOTIFS_ABSENCE } from '../../../utils/absences.js';

const sauf = (p, f) => (p.vide ? null : f(p));
const libelleMotif = (id) => MOTIFS_ABSENCE.find((m) => m.id === id)?.label || id;

const parPersonne = (cle) => ({
  id: 'personne', libelle: 'Par personne',
  parts: (p) => Object.entries(p.parPersonne || {}).map(([userId, v]) => ({
    cle: userId, libelle: p.noms?.[userId] || 'Personne inconnue', donnee: true, valeur: v[cle],
  })),
});

export const famillePlanning = {
  id: 'planning',
  libelle: 'Planning et pointage',
  journee: 'la date de l\'horaire',
  calculer(donnees, tranches) {
    return serieHeures({ shifts: donnees.shifts, contrats: donnees.contrats, absences: donnees.absences, tranches })
      .map((p) => ({ ...p, noms: donnees.noms }));
  },
  mesures: [
    {
      id: 'planning.heures_prevues', libelle: 'Heures planifiées', unite: 'h', nature: 'flux',
      valeur: (p) => sauf(p, (x) => x.prevues),
      ventilations: [parPersonne('prevues')],
      phrase: 'Durée des horaires prévus, pause déduite, service coupé compté en deux créneaux, comme les totaux de la grille.',
    },
    {
      id: 'planning.heures_pointees', libelle: 'Heures pointées', unite: 'h', nature: 'flux',
      valeur: (p) => sauf(p, (x) => x.pointees),
      ventilations: [parPersonne('pointees')],
      phrase: 'Durée entre l\'arrivée et le départ pointés, pause déduite ; un horaire sans départ pointé ne compte pas.',
    },
    {
      id: 'planning.retards', libelle: 'Arrivées en retard', unite: 'nombre', nature: 'flux',
      valeur: (p) => sauf(p, (x) => x.retards.nombre),
      phrase: 'Horaires pointés plus de cinq minutes après le début prévu.',
    },
    {
      id: 'planning.minutes_retard', libelle: 'Minutes de retard', unite: 'min', nature: 'flux',
      valeur: (p) => sauf(p, (x) => x.retards.minutes),
      phrase: 'Somme des minutes de retard au-delà de la tolérance de cinq minutes.',
    },
    {
      id: 'planning.solde', libelle: 'Solde d\'heures selon le contrat', unite: 'h', nature: 'flux', reserve: 'direction',
      valeur: (p) => p.solde,
      ventilations: [{
        id: 'personne', libelle: 'Par personne',
        parts: (p) => Object.entries(p.soldes || {}).map(([userId, v]) => ({ cle: userId, libelle: p.noms?.[userId] || 'Personne inconnue', donnee: true, valeur: v })),
      }],
      phrase: 'Heures pointées moins heures dues selon le contrat, absences créditées déduites ; n/a sans contrat sur la période. Réservé à la direction.',
    },
    {
      id: 'planning.absences', libelle: 'Jours d\'absence', unite: 'jour', nature: 'flux',
      valeur: (p) => (p.absences ? Object.values(p.absences).reduce((s, n) => s + n, 0) : null),
      ventilations: [{ id: 'motif', libelle: 'Par motif', parts: (p) => Object.entries(p.absences || {}).map(([m, n]) => ({ cle: m, libelle: libelleMotif(m), valeur: n })) }],
      phrase: 'Jours couverts par une absence saisie au planning, par personne et par jour, tous motifs.',
    },
  ],
};
