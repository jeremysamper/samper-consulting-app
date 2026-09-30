// ═══════════════════════════════════════════════════════════════════════════
// Statuts d'une réservation, et le choix de l'heure par défaut à la saisie.
//
// Les statuts existaient depuis l'origine en base ('confirme', 'arrive',
// 'parti', 'no_show', 'annule') mais aucun écran ne les exposait : impossible
// de savoir qui était déjà à table. Source unique pour la liste du jour, la
// fiche détail et les pastilles du plan de salle, sinon les trois surfaces
// divergent au premier ajout.
//
// 'annule' n'est pas dans la liste : une réservation annulée disparaît des
// écrans, elle n'est pas un état qu'on fait défiler.
// ═══════════════════════════════════════════════════════════════════════════

import { zurichToday, zurichNowMinutes } from '../../utils/zurichTime.js';

export const STATUTS = ['confirme', 'arrive', 'parti', 'no_show'];

// 'demande' n'est pas dans STATUTS non plus : c'est une réservation venue du
// site (réservation en ligne, mode « à confirmer »). Elle se confirme ou se
// refuse (boutons dédiés, qui préviennent le client par e-mail), elle ne se
// fait pas défiler avec les états du service.
export const STATUT_META = {
  demande: {
    label: 'À confirmer',
    court: 'À confirmer',
    bg: 'var(--warning-bg-soft)',
    texte: 'var(--warning-text)',
    bordure: 'var(--warning-bd)',
  },
  confirme: {
    label: 'Attendu',
    court: 'Attendu',
    bg: 'var(--surface)',
    texte: 'var(--text2)',
    bordure: 'var(--border)',
  },
  arrive: {
    label: 'Arrivé',
    court: 'À table',
    bg: 'var(--success-bg-soft)',
    texte: 'var(--success-text)',
    bordure: 'var(--success-bd)',
  },
  parti: {
    label: 'Parti',
    court: 'Parti',
    bg: 'var(--bg)',
    texte: 'var(--text3)',
    bordure: 'var(--border)',
  },
  no_show: {
    label: 'No-show',
    court: 'No-show',
    bg: 'var(--danger-bg-soft)',
    texte: 'var(--danger-text)',
    bordure: 'var(--danger-bd)',
  },
};

export function metaStatut(statut) {
  return STATUT_META[statut] || STATUT_META.confirme;
}

// Une table libérée ne pèse plus sur le service en cours : 'parti' et
// 'no_show' sortent des compteurs de présence à l'écran. Les couverts
// prévisionnels, eux, restent gérés par le trigger côté base.
export function estPresent(statut) {
  return statut === 'demande' || statut === 'confirme' || statut === 'arrive';
}

// ── Services et leur code couleur ─────────────────────────────────────────
// Midi orange, soir bleu : le même repère sur le planning de la semaine, la
// vue jour et le mode service. Couleurs en tokens (app.css), pour rester
// lisibles en sombre.
export const SERVICE_META = {
  midi: { label: 'Midi', couleur: 'var(--svc-midi)', fond: 'var(--svc-midi-bg)', bordure: 'var(--svc-midi-bd)' },
  soir: { label: 'Soir', couleur: 'var(--svc-soir)', fond: 'var(--svc-soir-bg)', bordure: 'var(--svc-soir-bd)' },
};

// Le planning de la semaine et le mode service ne connaissent que deux
// services : le brunch EST le midi du dimanche (décision de Jérémy, 01.10.2026).
// Une colonne ou un onglet « Brunch » à part gênerait tous les établissements
// qui n'en font pas. La valeur 'brunch' reste en base et dans la saisie.
export const SERVICES_AFFICHES = ['midi', 'soir'];
export const serviceAffiche = (service) => (service === 'brunch' ? 'midi' : service);

// Service ouvert d'office dans le mode service. Aujourd'hui : celui que dit
// l'horloge, sauf s'il est vide et qu'un autre ne l'est pas (le Rucher tourne
// à un seul service). Un autre jour : le plus chargé.
export function serviceEnCours(dateISO, resas) {
  const couverts = { midi: 0, soir: 0 };
  for (const r of resas || []) {
    if (r.statut === 'no_show') continue;
    const s = serviceAffiche(r.service);
    couverts[s] = (couverts[s] || 0) + (r.nb_couverts || 0);
  }
  const plusCharge = SERVICES_AFFICHES.reduce((a, b) => (couverts[b] > couverts[a] ? b : a), 'soir');
  if (dateISO !== zurichToday()) return plusCharge;
  const horloge = serviceParDefaut(dateISO);
  return couverts[horloge] > 0 || couverts[plusCharge] === 0 ? horloge : plusCharge;
}

// Retard d'une réservation attendue, en minutes (0 si elle n'est pas en
// retard). Seulement pour aujourd'hui, à l'heure de Zurich.
export function minutesDeRetard(resa, dateISO, maintenant = zurichNowMinutes()) {
  if (resa.statut !== 'confirme' || dateISO !== zurichToday()) return 0;
  const [h, m] = String(resa.heure_arrivee || '').split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return Math.max(0, maintenant - (h * 60 + m));
}

// ── Service par défaut à la saisie ────────────────────────────────────────
// Quand on saisit pour AUJOURD'HUI, l'heure qu'il est en dit plus long que
// n'importe quelle valeur figée : à 16h on prend une résa pour le soir, pas
// pour le midi qui est passé. Pour une autre date, on ne devine rien et on
// retombe sur le soir, service le plus chargé partout.
//
// Le brunch n'est JAMAIS proposé d'office, même le dimanche matin : c'est un
// service d'exception que la plupart des maisons ne font pas (le Rucher tourne
// à un seul shift, Woodland en double midi/soir). Le choisir automatiquement
// se tromperait presque à tous les coups. Il reste à un tap.
const BASCULE_MIDI_SOIR = 15 * 60;   // après 15h00, on vise le soir

export function serviceParDefaut(dateISO) {
  if (dateISO !== zurichToday()) return 'soir';
  return zurichNowMinutes() < BASCULE_MIDI_SOIR ? 'midi' : 'soir';
}
