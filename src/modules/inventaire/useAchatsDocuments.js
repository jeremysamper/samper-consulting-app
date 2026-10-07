import React from 'react';
import { dbService } from '../../services/dbService.js';

// ─────────────────────────────────────────────────────────────────────────────
// Documents d'achat de l'établissement (achats_documents), partagés par les
// onglets « Achats & consommation » et « Factures » de l'inventaire.
//
// docs : null = chargement, 'absente' = migration non appliquée, sinon la
// liste. Une lecture en échec garde la liste précédente et lève `loadError` :
// une période vide ne doit jamais passer pour une période sans facture.
// `docsRef` suit la liste à chaque écriture, avant le rendu : la file d'import
// y cherche les doublons pendant que plusieurs lectures tournent.
//
// Appelé UNE fois, par Inventaire.jsx, et passé aux deux onglets : avec une
// copie par onglet, l'upsert de document entier fait depuis Achats pouvait
// réécrire une date tout juste corrigée dans Factures, avant que sa copie ne
// soit rechargée. `actif` : rien n'est lu tant qu'aucun des deux onglets n'a
// été ouvert, le comptage reste léger.
// ─────────────────────────────────────────────────────────────────────────────

export function useAchatsDocuments(etabId, { actif = true } = {}) {
  const legacySB = dbService.getBridge();
  const [docs, setDocs] = React.useState(null);
  const [loadError, setLoadError] = React.useState(false);
  const docsRef = React.useRef([]);
  // Ids des documents dont la photo ou le PDF est gardé (importés depuis le
  // 03.10.2026 ; les plus anciens n'ont que leurs lignes lues).
  const [avecPieces, setAvecPieces] = React.useState(() => new Set());

  const majDocs = React.useCallback((calculer) => {
    const liste = Array.isArray(docsRef.current) ? docsRef.current : [];
    docsRef.current = calculer(liste);
    setDocs(docsRef.current);
  }, []);

  const reload = React.useCallback(async () => {
    if (!legacySB) { setDocs([]); return; }
    // Photos gardées : sans elles, seuls les boutons « Voir » manquent.
    legacySB.db.listAchatsDocsAvecPieces(etabId)
      .then(setAvecPieces)
      .catch(err => console.error('[achats pièces]', err));
    try {
      const liste = await legacySB.db.listAchatsDocuments(etabId);
      if (liste === null) { docsRef.current = []; setDocs('absente'); return; }
      docsRef.current = liste;
      setDocs(liste);
      setLoadError(false);
    } catch (err) {
      console.error('[achats documents]', err);
      setLoadError(true);
      setDocs(prev => (prev === null ? [] : prev));
    }
  }, [etabId]);

  React.useEffect(() => {
    docsRef.current = [];
    setDocs(null);
    if (!actif) return undefined;
    reload();
    const unsub = legacySB?.realtime?.subscribeReload?.('achats_documents', reload);
    return () => { unsub && unsub(); };
  }, [etabId, actif]);

  return {
    docs,
    tousLesDocs: Array.isArray(docs) ? docs : [],
    tableAbsente: docs === 'absente',
    loadError,
    docsRef,
    majDocs,
    reload,
    avecPieces,
    setAvecPieces,
  };
}
