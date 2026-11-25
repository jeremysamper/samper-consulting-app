// ─────────────────────────────────────────────────────────────
// File des ventes en espèces gardées sans réseau : stockage IndexedDB
// (lot 07 du panel, 25.11.2026).
//
// Chaque élément est une vente capturée au moment du geste (forme :
// elementDeFile de src/modules/caisse/horsLigne.js) :
//   { clientUuid, etablissementId, ticketId, userId, poste, gesteAt (ISO UTC),
//     createdAt (ms), aEmporter, paiements, etat ('attente' | 'refuse' |
//     'deja_encaisse'), motif, numero, apercu }
//
// clientUuid est généré sur l'appareil et sert de clé d'idempotence : côté
// base, caisse_encaissements_hors_ligne.client_uuid est PRIMARY KEY, un rejeu
// répété n'encaisse jamais deux fois. Aucune donnée de client dans la file.
//
// L'ouverture de la base est mutualisée dans offlineDb.js.
// ─────────────────────────────────────────────────────────────

import { STORES, withStore } from './offlineDb.js';

export const caisseQueue = {
  // put sert à l'ajout et au changement d'état (refusée, déjà encaissée).
  put(item) {
    return withStore(STORES.CAISSE, 'readwrite', (store) => store.put(item));
  },
  remove(clientUuid) {
    return withStore(STORES.CAISSE, 'readwrite', (store) => store.delete(clientUuid));
  },
  async list() {
    const items = await withStore(STORES.CAISSE, 'readonly', (store) => store.getAll());
    return items || [];
  },
  async count() {
    const n = await withStore(STORES.CAISSE, 'readonly', (store) => store.count());
    return n || 0;
  },
};
