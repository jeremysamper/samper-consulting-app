// ─────────────────────────────────────────────────────────────
// File d'attente des pointages hors-ligne : stockage IndexedDB.
//
// Chaque élément est un punch capturé au moment du geste :
//   { clientUuid, shiftId, type ('arrivee'|'depart'), userId,
//     etablissementId, eventAt (ISO UTC), createdAt (ms), attempts }
//
// clientUuid est généré sur l'appareil et sert de clé d'idempotence :
// côté base, pointages_offline.client_uuid est PRIMARY KEY, un rejeu
// répété ne crée jamais de doublon.
//
// L'ouverture de la base est mutualisée dans offlineDb.js : plusieurs files
// cohabitent dans « samper-offline » et une seule version fait autorité.
// ─────────────────────────────────────────────────────────────

import { STORES, withStore } from './offlineDb.js';

export const punchQueue = {
  // put sert à la fois à l'ajout et à la mise à jour (compteur de tentatives).
  put(item) {
    return withStore(STORES.PUNCH, 'readwrite', (store) => store.put(item));
  },
  remove(clientUuid) {
    return withStore(STORES.PUNCH, 'readwrite', (store) => store.delete(clientUuid));
  },
  async list() {
    const items = await withStore(STORES.PUNCH, 'readonly', (store) => store.getAll());
    return items || [];
  },
  async count() {
    const n = await withStore(STORES.PUNCH, 'readonly', (store) => store.count());
    return n || 0;
  },
};
