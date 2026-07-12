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
// IndexedDB et pas localStorage : écriture fiable, quota large,
// disponible dans les PWA installées (règle du chantier hors-ligne).
// ─────────────────────────────────────────────────────────────

const DB_NAME = 'samper-offline';
const DB_VERSION = 1;
const STORE = 'punch-queue';

let dbPromise = null;

function openDb() {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('Stockage hors-ligne indisponible sur cet appareil'));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'clientUuid' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    // Échec d'ouverture (mode privé restrictif...) : on retentera au prochain appel.
    dbPromise.catch(() => { dbPromise = null; });
  }
  return dbPromise;
}

// Exécute `fn(store)` dans une transaction et résout une fois celle-ci committée
// (pas seulement la requête : garantit la persistance avant de continuer).
async function withStore(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    let result;
    try {
      const request = fn(tx.objectStore(STORE));
      if (request) request.onsuccess = () => { result = request.result; };
    } catch (err) {
      reject(err);
      return;
    }
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const punchQueue = {
  // put sert à la fois à l'ajout et à la mise à jour (compteur de tentatives).
  put(item) {
    return withStore('readwrite', (store) => store.put(item));
  },
  remove(clientUuid) {
    return withStore('readwrite', (store) => store.delete(clientUuid));
  },
  async list() {
    const items = await withStore('readonly', (store) => store.getAll());
    return items || [];
  },
  async count() {
    const n = await withStore('readonly', (store) => store.count());
    return n || 0;
  },
};
