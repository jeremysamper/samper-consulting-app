// ─────────────────────────────────────────────────────────────
// File d'attente des relevés de température HACCP hors ligne (lot 08).
//
// Un élément : { id, etablissementId, zoneId, date, heure, valeur, operateur,
// conforme, commentaire, zoneNom, userId, createdAt, attempts }. `date` et
// `heure` sont celles du geste (Zurich), jamais celles de l'envoi.
//
// L'ouverture de la base est mutualisée dans offlineDb.js.
// ─────────────────────────────────────────────────────────────

import { STORES, withStore } from './offlineDb.js';

export const haccpReleveQueue = {
  put(item) {
    return withStore(STORES.HACCP_RELEVES, 'readwrite', (store) => store.put(item));
  },
  remove(id) {
    return withStore(STORES.HACCP_RELEVES, 'readwrite', (store) => store.delete(id));
  },
  async list() {
    const items = await withStore(STORES.HACCP_RELEVES, 'readonly', (store) => store.getAll());
    return items || [];
  },
  async count() {
    const n = await withStore(STORES.HACCP_RELEVES, 'readonly', (store) => store.count());
    return n || 0;
  },
};
