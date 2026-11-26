// ─────────────────────────────────────────────────────────────
// File d'attente des statuts de chambre changés hors ligne (lot 23).
//
// Un élément : { cle, etablissementId, chambreId, numero, statut, motif,
// gesteAt, userId, createdAt, attempts }. `gesteAt` est l'heure du geste sur
// l'appareil, jamais celle de l'envoi. Clé = `cle`, posée sur l'appareil : deux
// gestes sur la même chambre restent deux éléments, rejoués dans l'ordre.
//
// L'ouverture de la base est mutualisée dans offlineDb.js.
// ─────────────────────────────────────────────────────────────

import { STORES, withStore } from './offlineDb.js';

export const etagesQueue = {
  put(item) {
    return withStore(STORES.ETAGES, 'readwrite', (store) => store.put(item));
  },
  remove(cle) {
    return withStore(STORES.ETAGES, 'readwrite', (store) => store.delete(cle));
  },
  async list() {
    const items = await withStore(STORES.ETAGES, 'readonly', (store) => store.getAll());
    return items || [];
  },
  async count() {
    const n = await withStore(STORES.ETAGES, 'readonly', (store) => store.count());
    return n || 0;
  },
};
