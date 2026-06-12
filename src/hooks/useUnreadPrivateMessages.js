import React from 'react';
import { dbService } from '../services/dbService.js';

// Nombre de messages privés non lus pour l'utilisateur courant.
// Realtime : recompte à chaque changement sur private_messages (envoi
// consultant ou marquage lu depuis un autre device).
export function useUnreadPrivateMessages(userId) {
  const [count, setCount] = React.useState(0);

  React.useEffect(() => {
    if (!userId) return undefined;
    const legacySB = dbService.getBridge();
    if (!legacySB?.db?.countUnreadPrivateMessages) return undefined;

    let mounted = true;
    const load = async () => {
      try {
        const c = await legacySB.db.countUnreadPrivateMessages(userId);
        if (mounted) setCount(c);
      } catch (e) {}
    };
    load();
    const unsub = legacySB.realtime.subscribeReload('private_messages', load);
    return () => { mounted = false; unsub && unsub(); };
  }, [userId]);

  return count;
}
