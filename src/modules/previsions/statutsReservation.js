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

export const STATUT_META = {
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
  return statut === 'confirme' || statut === 'arrive';
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
