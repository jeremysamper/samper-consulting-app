import React from 'react';
import { supabase } from '../../services/supabase.js';
import { dbService } from '../../services/dbService.js';
import { zurichAjouterJours, zurichToday } from '../../utils/zurichTime.js';
import { lireGroupes } from '../../hooks/useGroupes.js';

// ─────────────────────────────────────────────────────────────────────────────
// Données de la Commande V1 (lot 4a) : fournisseurs et leurs jours de
// livraison, commandes des deux dernières semaines et à venir, leurs lignes et
// leurs groupes, produits habituels, stocks cibles, catalogue de la maison et
// groupes des 30 prochains jours. Relu au temps réel sur les deux tables de la
// commande (commande_lignes n'a pas d'etablissement_id : la RLS filtre, on
// relit tout).
// Une lecture en échec n'est jamais lue comme une liste vide : status 'error'.
// ─────────────────────────────────────────────────────────────────────────────

const lire = async (requete, nom) => {
  const { data, error } = await requete;
  if (error) { console.error('[commande]', nom, error); throw error; }
  return data || [];
};

export function useCommandeV1(etabId) {
  const [etat, setEtat] = React.useState({
    status: 'loading', fournisseurs: [], commandes: [], lignes: [], groupesPris: [], habituels: [], cibles: [], produits: [], groupes: [],
  });
  const vivant = React.useRef(true);

  const relire = React.useCallback(async () => {
    if (!etabId) return;
    const aujourdhui = zurichToday();
    try {
      const [fournisseurs, commandes, habituels, cibles, produits, groupes] = await Promise.all([
        lire(supabase.from('fournisseurs').select('id, nom, email, tel, actif, jours_livraison, heure_limite, delai_commande_jours')
          .eq('etablissement_id', etabId).order('nom'), 'fournisseurs'),
        lire(supabase.from('commandes').select('*').eq('etablissement_id', etabId)
          .gte('date_livraison', zurichAjouterJours(aujourdhui, -14)).order('date_livraison'), 'commandes'),
        lire(supabase.from('commande_habituels').select('*').eq('etablissement_id', etabId).order('ordre'), 'habituels'),
        lire(supabase.from('commande_cibles').select('produit_id, jour_livraison, quantite').eq('etablissement_id', etabId), 'cibles'),
        lire(supabase.from('produits').select('id, nom, unite_ref, fournisseur_id, conditionnement, conditionnement_qte, categorie')
          .eq('etablissement_id', etabId).order('nom'), 'produits'),
        lireGroupes(etabId, aujourdhui, zurichAjouterJours(aujourdhui, 75)).catch((e) => { console.error('[commande] groupes', e); return []; }),
      ]);
      const ids = commandes.map((c) => c.id);
      const [lignes, groupesPris] = ids.length
        ? await Promise.all([
          lire(supabase.from('commande_lignes').select('*').in('commande_id', ids).order('ordre'), 'lignes'),
          lire(supabase.from('commande_groupes').select('*').in('commande_id', ids), 'groupes de la commande'),
        ])
        : [[], []];
      if (!vivant.current) return;
      setEtat({
        status: 'ready',
        fournisseurs: fournisseurs.filter((f) => f.actif !== false).sort((a, b) => String(a.nom || '').localeCompare(String(b.nom || ''), 'fr', { sensitivity: 'base' })),
        commandes, lignes, groupesPris, habituels, cibles, produits, groupes,
      });
    } catch {
      if (vivant.current) setEtat((e) => ({ ...e, status: e.status === 'ready' ? 'ready' : 'error' }));
    }
  }, [etabId]);

  React.useEffect(() => {
    vivant.current = true;
    relire();
    const realtime = dbService.getRealtime();
    const unsub = realtime?.subscribeReload
      ? realtime.subscribeReload(['commandes', 'commande_lignes', 'commande_groupes', 'commande_habituels', 'commande_cibles', 'fournisseurs'], relire)
      : null;
    return () => { vivant.current = false; if (unsub) unsub(); };
  }, [relire]);

  // Mise à jour locale d'une ligne (saisie en cours), avant la relecture.
  const poserLigne = React.useCallback((id, valeurs) => {
    setEtat((e) => ({ ...e, lignes: e.lignes.map((l) => (l.id === id ? { ...l, ...valeurs } : l)) }));
  }, []);

  return { ...etat, relire, poserLigne };
}
