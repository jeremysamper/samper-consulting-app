import { readText, writeText } from '../utils/storage.js';

// ─────────────────────────────────────────────────────────────────────────────
// Avis d'un nouveau message privé (plan 15, lot 2) : un réglage de cet
// appareil, dans Réglages > Notifications. Éteint par défaut (la pastille de
// la barre du haut suffit, comme avant).
// Allumé : un message reçu pendant que l'app est ouverte donne un avis bref ;
// l'app en arrière-plan, une notification du système au titre neutre (rien
// du message ne s'affiche sur l'écran verrouillé). App fermée, rien : il
// faudrait un envoi par le serveur, que le lot ne pose pas.
// ─────────────────────────────────────────────────────────────────────────────

const CLE = 'sc_avis_messages';
const abonnes = new Set();

export const avisMessagesActif = () => readText(CLE, '') === '1';

export function reglerAvisMessages(actif) {
  writeText(CLE, actif ? '1' : '');
  abonnes.forEach((fn) => { try { fn(actif); } catch { /* un abonné ne bloque pas les autres */ } });
}

export function surAvisMessages(fn) {
  abonnes.add(fn);
  return () => { abonnes.delete(fn); };
}

// Permission du système pour la notification en arrière-plan : demandée au
// geste qui allume l'avis. Rend l'état obtenu ('granted', 'denied',
// 'default' ou 'non-supporte').
export async function demanderPermissionAvis() {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'non-supporte';
  if (window.Notification.permission !== 'default') return window.Notification.permission;
  try { return await window.Notification.requestPermission(); } catch { return 'denied'; }
}

// Un nouveau message vient d'arriver : l'avis, si l'appareil l'a demandé.
// `notifier` est le toast de l'app (passé par l'appelant pour ne rien
// importer de React ici).
export function aviserNouveauMessage(notifier) {
  if (!avisMessagesActif() || typeof document === 'undefined') return;
  if (document.visibilityState === 'visible') {
    notifier?.('Vous avez un nouveau message.', 'info');
    return;
  }
  try {
    if ('Notification' in window && window.Notification.permission === 'granted') {
      new window.Notification('Jouanet', { body: 'Nouveau message', tag: 'sc-message', icon: '/icons/icon-192-v4.png' });
    }
  } catch { /* notification impossible sur ce navigateur : la pastille reste */ }
}
