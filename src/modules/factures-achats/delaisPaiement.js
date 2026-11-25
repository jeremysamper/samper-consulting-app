import React from 'react';
import { supabase } from '../../services/supabase.js';
import { dbService } from '../../services/dbService.js';
import { DELAI_PAIEMENT_DEFAUT } from './echeancesPrevues.js';

export { DELAI_PAIEMENT_DEFAUT, avecEcheancesPrevues } from './echeancesPrevues.js';

// ─────────────────────────────────────────────────────────────────────────────
// Délais de paiement (lot 2 du plan 15) : celui de la maison
// (compta_reglages.delai_paiement_jours, 30 jours par défaut) et celui d'un
// fournisseur (fournisseurs.delai_paiement_jours, null = celui de la maison).
// L'échéance d'une facture qui n'en porte pas se calcule à la lecture : date
// du document plus le délai. Rien n'est écrit dans la facture.
// ─────────────────────────────────────────────────────────────────────────────

export function useDelaisPaiement(etabId) {
  const [delais, setDelais] = React.useState({ maison: DELAI_PAIEMENT_DEFAUT, parFournisseur: new Map() });
  React.useEffect(() => {
    if (!etabId) return undefined;
    let vivant = true;
    const lire = async () => {
      const [reglages, fournisseurs] = await Promise.all([
        supabase.from('compta_reglages').select('delai_paiement_jours').eq('etablissement_id', etabId).maybeSingle(),
        supabase.from('fournisseurs').select('id, delai_paiement_jours').eq('etablissement_id', etabId),
      ]);
      if (!vivant) return;
      if (reglages.error) console.error('[délais de paiement] maison', reglages.error);
      if (fournisseurs.error) console.error('[délais de paiement] fournisseurs', fournisseurs.error);
      const maison = Number.isInteger(reglages.data?.delai_paiement_jours) ? reglages.data.delai_paiement_jours : DELAI_PAIEMENT_DEFAUT;
      const parFournisseur = new Map((fournisseurs.data || [])
        .filter((f) => Number.isInteger(f.delai_paiement_jours))
        .map((f) => [f.id, f.delai_paiement_jours]));
      setDelais({ maison, parFournisseur });
    };
    lire();
    const realtime = dbService.getRealtime();
    const unsub = realtime?.subscribeReload ? realtime.subscribeReload(['compta_reglages', 'fournisseurs'], lire) : null;
    return () => { vivant = false; if (unsub) unsub(); };
  }, [etabId]);
  return delais;
}
