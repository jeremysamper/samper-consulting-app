// ─────────────────────────────────────────────────────────────────────────────
// Indicateurs des pastilles « +N », partagés par la coque (lot P3).
//
// Le fournisseur est posé dans AppLayout. Il ne lit points_indicateurs que si
// le système est allumé pour l'établissement courant ET que la personne
// participe ; sinon aucun appel, aucune pastille, aucun nœud ajouté au DOM.
// Relu au montage d'un écran à pastilles (usePastillesPoints) et après chaque
// crédit reçu par l'abonnement de la coque (ecouterMouvements) ; aucun sondage.
// ─────────────────────────────────────────────────────────────────────────────
import React from 'react';
import { supabase } from '../../services/supabase.js';
import { ecouterMouvements } from './usePointsRetour.js';
import { pastillePointage, pointsPastille } from './indicateurs.js';

const Contexte = React.createContext(null);

// Une relecture n'est pas relancée à moins de 5 s de la précédente.
const ECART_MIN_MS = 5000;

export function IndicateursPointsProvider({ etabId, userId, actif, children }) {
  const [ind, setInd] = React.useState(null);
  const etat = React.useRef({ cle: null, enCours: null, lu: 0 });
  const cle = actif && etabId && userId ? `${userId}|${etabId}` : null;

  const charger = React.useCallback(async ({ force = false } = {}) => {
    const e = etat.current;
    if (!cle) return;
    if (e.enCours) return;
    if (!force && e.cle === cle && Date.now() - e.lu < ECART_MIN_MS) return;
    e.enCours = supabase.rpc('points_indicateurs', { p_etab: etabId });
    try {
      const { data, error } = await e.enCours;
      if (error) throw error;
      e.cle = cle;
      e.lu = Date.now();
      setInd(data && data.actif ? { cle, ...data } : null);
    } catch (err) {
      console.warn('[points] indicateurs non lus', err?.message || err);
    } finally {
      e.enCours = null;
    }
  }, [cle, etabId]);

  React.useEffect(() => {
    if (!cle) { setInd(null); return undefined; }
    charger({ force: true });
    return ecouterMouvements(() => charger({ force: true }));
  }, [cle, charger]);

  const valeur = React.useMemo(() => {
    const courant = cle && ind && ind.cle === cle ? ind : null;
    return {
      actif: Boolean(courant),
      rafraichir: charger,
      pastille: (action, opts) => (courant ? pointsPastille(courant, action, opts) : null),
      pastillePointage: (shift, maintenant) => (courant ? pastillePointage(courant, shift, maintenant) : null),
    };
  }, [cle, ind, charger]);

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

const AUCUNE = { actif: false, rafraichir: () => {}, pastille: () => null, pastillePointage: () => null };

// Pastilles d'un écran : relit les indicateurs au montage (au plus une fois
// toutes les 5 s), puis rend les fonctions de choix.
export function usePastillesPoints() {
  const valeur = React.useContext(Contexte) || AUCUNE;
  const { rafraichir, actif } = valeur;
  React.useEffect(() => { if (actif) rafraichir(); }, [actif, rafraichir]);
  return valeur;
}
