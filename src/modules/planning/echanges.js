import React from 'react';
import { supabase } from '../../services/supabase.js';
import { inscrireGeste } from '../../services/tempsGagne.js';

// ─────────────────────────────────────────────────────────────────────────────
// Échange de services entre employés (lot C2, migration 20261119). Lecture des
// échanges ouverts de l'établissement ; écritures par les fonctions echange_*
// (gardes en base). Sans la migration, statut 'absent' et rien ne s'affiche.
// ─────────────────────────────────────────────────────────────────────────────

const RELATION_ABSENTE = new Set(['42P01', 'PGRST205', 'PGRST202']);

function messageEchange(error) {
  if (!error) return null;
  const m = String(error.message || '');
  // Les gardes en base écrivent leur raison en français : on la montre telle quelle.
  if (/[A-Za-zÀ-ÿ]/.test(m) && error.code && ['42501', '22023', 'P0002', '23505'].includes(String(error.code))) {
    return String(error.code) === '23505' ? 'Cet horaire est déjà proposé à l\'échange.' : m;
  }
  return 'L\'échange n\'a pas pu être enregistré. Réessayez.';
}

export function useEchanges(etabId) {
  const [etat, setEtat] = React.useState({ statut: etabId ? 'chargement' : 'absent', echanges: [] });
  const [version, setVersion] = React.useState(0);
  const relire = React.useCallback(() => setVersion((v) => v + 1), []);

  React.useEffect(() => {
    if (!etabId) { setEtat({ statut: 'absent', echanges: [] }); return undefined; }
    let vivant = true;
    supabase.from('echanges_horaires').select('id, shift_id, demandeur, repreneur, statut, message, created_at')
      .eq('etablissement_id', etabId).in('statut', ['propose', 'repris']).order('created_at').limit(300)
      .then(({ data, error }) => {
        if (!vivant) return;
        if (error) setEtat((p) => ({ statut: RELATION_ABSENTE.has(error.code) ? 'absent' : (p.statut === 'pret' ? 'pret' : 'erreur'), echanges: p.echanges }));
        else setEtat({ statut: 'pret', echanges: data || [] });
      });
    return () => { vivant = false; };
  }, [etabId, version]);

  const appeler = React.useCallback(async (fn, args) => {
    const { error } = await supabase.rpc(fn, args);
    relire();
    return messageEchange(error);
  }, [relire]);

  return {
    ...etat,
    relire,
    proposer: (shiftId) => appeler('echange_proposer', { p_shift_id: shiftId }),
    reprendre: (id) => appeler('echange_reprendre', { p_id: id }),
    retirer: (id) => appeler('echange_retirer', { p_id: id }),
    decider: async (id, accepter) => {
      const err = await appeler('echange_decider', { p_id: id, p_accepter: accepter });
      if (!err && accepter) inscrireGeste(etabId, 'echange_valide');
      return err;
    },
  };
}
