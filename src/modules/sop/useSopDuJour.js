import React from 'react';
import { dbService } from '../../services/dbService.js';

// ─────────────────────────────────────────────────────────────────────────────
// Procédures et exécutions du jour (plan 15, lot 5), pour les rappels de
// « À faire maintenant » (rappelsSop.js). Deux lectures du pont, relues au
// temps réel des deux tables ; en échec, aucune ligne n'est montrée.
// ─────────────────────────────────────────────────────────────────────────────

export function useSopDuJour({ etabId, jour, enabled }) {
  const [etat, setEtat] = React.useState({ sops: [], executions: [], lu: false });
  React.useEffect(() => {
    const pont = dbService.getBridge();
    if (!etabId || !enabled || !pont?.db) { setEtat({ sops: [], executions: [], lu: false }); return undefined; }
    let vivant = true;
    const lire = async () => {
      try {
        const [sops, executions] = await Promise.all([
          pont.db.listSops(etabId, { strict: true }),
          pont.db.listSopExecutions(etabId, { dateFrom: jour, dateTo: jour, strict: true }),
        ]);
        if (vivant) setEtat({ sops: sops || [], executions: executions || [], lu: true });
      } catch (err) {
        console.warn('[sop] rappels du jour', err);
      }
    };
    lire();
    const unsub = pont.realtime?.subscribeReload ? pont.realtime.subscribeReload(['sops', 'sop_executions'], () => { if (vivant) lire(); }) : null;
    return () => { vivant = false; if (unsub) unsub(); };
  }, [etabId, jour, enabled]);
  return etat;
}
