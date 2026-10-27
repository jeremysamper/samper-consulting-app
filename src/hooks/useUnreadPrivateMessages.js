import React from 'react';
import { dbService } from '../services/dbService.js';

// Nombre de messages privés non lus pour l'utilisateur courant.
// Realtime : recompte à chaque changement sur private_messages (nouveau
// message reçu, ou marquage lu depuis un autre appareil).
//
// Un seul canal pour toute l'app, quel que soit le nombre de lecteurs (coque,
// tableau de bord) : ouvert par le premier, fermé par le dernier. La
// messagerie de la barre du haut relit sur ses changements
// (surChangementMessages) sans en ouvrir un autre.
const partage = { userId: null, count: 0, lecteurs: new Set(), off: null };
const abonnes = new Set();

async function recompter() {
  const { userId } = partage;
  const legacySB = dbService.getBridge();
  if (!userId || !legacySB?.db?.countUnreadPrivateMessages) return;
  try {
    const c = await legacySB.db.countUnreadPrivateMessages(userId);
    if (partage.userId !== userId) return;
    partage.count = c;
    partage.lecteurs.forEach((lecteur) => lecteur(c));
  } catch { /* la prochaine notification recomptera */ }
}

function surChangement() {
  recompter();
  abonnes.forEach((fn) => {
    try { fn(); } catch { /* un abonné ne bloque pas les autres */ }
  });
}

// Lecture faite dans CET appareil : recompte tout de suite, sans attendre
// l'aller-retour realtime.
function surLecture() { recompter(); }

function fermerCanal() {
  if (partage.off) { partage.off(); partage.off = null; }
}

function rejoindre(userId, lecteur) {
  if (partage.userId !== userId) {
    // Autre compte : on repart de zéro.
    fermerCanal();
    partage.lecteurs.clear();
    partage.userId = userId;
    partage.count = 0;
  }
  partage.lecteurs.add(lecteur);
  if (!partage.off) {
    const unsub = dbService.getBridge().realtime.subscribeReload('private_messages', surChangement);
    window.addEventListener('sc:messages-read', surLecture);
    partage.off = () => { unsub && unsub(); window.removeEventListener('sc:messages-read', surLecture); };
  }
  recompter();
  return () => {
    partage.lecteurs.delete(lecteur);
    if (partage.lecteurs.size === 0) fermerCanal();
  };
}

// Abonnement aux changements de private_messages vus par le canal partagé ;
// rend la fonction de désabonnement.
export function surChangementMessages(fn) {
  abonnes.add(fn);
  return () => { abonnes.delete(fn); };
}

export function useUnreadPrivateMessages(userId) {
  const [count, setCount] = React.useState(() => (userId && partage.userId === userId ? partage.count : 0));

  React.useEffect(() => {
    if (!userId) return undefined;
    const legacySB = dbService.getBridge();
    if (!legacySB?.db?.countUnreadPrivateMessages) return undefined;
    return rejoindre(userId, setCount);
  }, [userId]);

  return count;
}
