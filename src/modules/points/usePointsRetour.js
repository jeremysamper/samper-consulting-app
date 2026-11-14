// ─────────────────────────────────────────────────────────────────────────────
// Retour immédiat « +N points : <geste> » (D16). Un seul abonnement Realtime
// sur points_mouvements, filtré sur la personne, posé une fois dans la coque
// (AppLayout) et seulement quand le système est actif et qu'elle participe.
// Il se défait au changement d'établissement, à la sortie du système et à la
// déconnexion (démontage de la coque). La RLS du registre ne laisse passer que
// les lignes de la personne.
// ─────────────────────────────────────────────────────────────────────────────
import React from 'react';
import { supabase } from '../../services/supabase.js';
import { notify } from '../../components/toast/index.js';
import { messageCredit } from './bareme.js';

let compteurCanal = 0;

// L'écran du module relit son solde à chaque mouvement reçu par ce seul
// abonnement, sans ouvrir un second canal.
const ecouteurs = new Set();
export function ecouterMouvements(fn) {
  ecouteurs.add(fn);
  return () => { ecouteurs.delete(fn); };
}

export function usePointsRetour({ etabId, userId, actif }) {
  React.useEffect(() => {
    if (!actif || !etabId || !userId) return undefined;
    compteurCanal += 1;
    const nom = `points_retour_${userId}_${Date.now()}_${compteurCanal}`;
    const canal = supabase
      .channel(nom)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'points_mouvements', filter: `user_id=eq.${userId}` },
        (payload) => {
          const m = payload?.new;
          if (!m || m.etablissement_id !== etabId) return;
          ecouteurs.forEach((fn) => { try { fn(m); } catch (e) { console.warn('[points] écouteur', e); } });
          if (m.sens === 'credit') notify(messageCredit(m), 'success');
        },
      )
      .subscribe();
    return () => {
      try { supabase.removeChannel(canal); } catch (e) { console.warn('[points] canal', e); }
    };
  }, [etabId, userId, actif]);
}
