import { punchOnlineOrQueue } from '../../services/offline/punchSync.js';
import { generateUuid } from '../../services/offline/offlineNet.js';
import { zurichClock } from '../../utils/zurichTime.js';

// ─────────────────────────────────────────────────────────────────────────────
// Pointage du jour, partagé par le tableau de bord (« Mon service ») et le
// module Planning.
//
// Arrivée sans horaire prévu : l'horaire du jour est créé au nom de
// l'équipier (RPC pointer_hors_planning), identifiant généré ici pour que la
// file hors-ligne et un double tap retombent sur le même horaire. L'appelant
// affiche l'horaire provisoire, puis le remplace par la réponse du serveur.
// ─────────────────────────────────────────────────────────────────────────────

export function horaireHorsPlanning({ etablissementId, userId, date }) {
  const heure = zurichClock();
  return {
    id: generateUuid(), etablissementId, userId, date,
    debut: heure, fin: heure, pointageDebut: heure, pointageFin: null, typeShift: 'simple', note: 'Pointage hors planning',
  };
}

export function envoyerHorsPlanning(bridge, horaire) {
  return punchOnlineOrQueue({
    call: () => bridge.db.pointerHorsPlanning(horaire.id, horaire.etablissementId),
    shiftId: horaire.id,
    type: 'arrivee',
    userId: horaire.userId || null,
    etablissementId: horaire.etablissementId,
    horsPlanning: true,
  });
}
