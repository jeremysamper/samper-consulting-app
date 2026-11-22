import React from 'react';
import { dbService } from '../../services/dbService.js';
import { notify } from '../../components/toast/index.js';
import { messageErreurPoints, pointsService } from './pointsService.js';

// ─────────────────────────────────────────────────────────────────────────────
// Cadeaux demandés à remettre (plan 15, lot 5) : pour « À faire maintenant »,
// chez qui gère les points (RLS de points_commandes : il lit les commandes de
// la maison). « Remettre » passe par la même RPC que l'onglet Commandes du
// module (points_traiter_commande) : un toucher, sans ouvrir le module. Le
// refus, plus rare, demande une note : il reste dans le module.
// ─────────────────────────────────────────────────────────────────────────────

export function useCadeauxATraiter({ etabId, enabled }) {
  const [etat, setEtat] = React.useState({ commandes: [], cadeaux: new Map(), lu: false });
  const relire = React.useRef(null);

  React.useEffect(() => {
    if (!etabId || !enabled) { setEtat({ commandes: [], cadeaux: new Map(), lu: false }); return undefined; }
    let vivant = true;
    const lire = async () => {
      try {
        const [commandes, cadeaux] = await Promise.all([pointsService.commandes(etabId), pointsService.cadeaux(etabId)]);
        if (!vivant) return;
        setEtat({
          commandes: commandes.filter((k) => k.statut === 'demandee'),
          cadeaux: new Map(cadeaux.map((c) => [c.id, c])),
          lu: true,
        });
      } catch (err) {
        // Rien n'est annoncé : sans lecture, aucune ligne n'est montrée.
        console.warn('[points] cadeaux à remettre', err);
      }
    };
    relire.current = lire;
    lire();
    const realtime = dbService.getRealtime();
    const unsub = realtime?.subscribeReload ? realtime.subscribeReload(['points_commandes'], () => { if (vivant) lire(); }) : null;
    return () => { vivant = false; relire.current = null; if (unsub) unsub(); };
  }, [etabId, enabled]);

  const remettre = React.useCallback(async (commandeId) => {
    try {
      await pointsService.traiterCommande(commandeId, 'remise');
      setEtat((e) => ({ ...e, commandes: e.commandes.filter((k) => k.id !== commandeId) }));
      notify('Cadeau remis.', 'success');
      relire.current?.();
      return true;
    } catch (err) {
      notify(messageErreurPoints(err), 'error');
      return false;
    }
  }, []);

  return { ...etat, remettre };
}
