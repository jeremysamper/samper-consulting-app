// ─────────────────────────────────────────────────────────────
// Base IndexedDB partagée des files hors-ligne.
//
// Une seule base, une seule version, un seul point d'ouverture. Deux modules
// qui ouvriraient « samper-offline » chacun avec sa version se bloqueraient
// mutuellement : la connexion restée en v1 empêche l'upgrade v2 tant qu'elle
// n'est pas fermée, et l'événement `blocked` n'arrive jamais si l'onglet reste
// ouvert. Le pointage serait alors gelé, inacceptable (cf. punchSync).
//
// Ajouter une file = ajouter une entrée dans STORES et incrémenter DB_VERSION.
// `onupgradeneeded` crée toutes les boutiques manquantes, quel que soit le
// point de départ : un appareil en v1 comme une installation neuve.
//
// IndexedDB et pas localStorage : écriture fiable, quota large, disponible
// dans les PWA installées (règle du chantier hors-ligne).
// ─────────────────────────────────────────────────────────────

const DB_NAME = 'samper-offline';
const DB_VERSION = 2;

export const STORES = {
  PUNCH: 'punch-queue',
  INVENTAIRE: 'inventaire-queue',
};

let dbPromise = null;

// Ouverture bloquée : un onglet encore sur l'ANCIENNE version de l'app garde
// la base ouverte en v1 et ne la relâche pas (l'ancien code n'écoutait pas
// versionchange). Plutôt que d'attendre indéfiniment, on abandonne après ce
// délai : l'appelant affiche son erreur au lieu d'un sablier sans fin, et la
// prochaine tentative réessaie (l'ancien onglet a pu être fermé entre-temps).
const BLOCKED_TIMEOUT_MS = 4000;

function openDb() {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('Stockage hors-ligne indisponible sur cet appareil'));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      let blockedTimer = null;
      request.onblocked = () => {
        blockedTimer = setTimeout(() => {
          reject(new Error("Stockage hors-ligne occupé par un autre onglet de l'app : fermez-le puis réessayez"));
        }, BLOCKED_TIMEOUT_MS);
      };
      request.onupgradeneeded = () => {
        const db = request.result;
        // punch-queue : clé = clientUuid (idempotence côté base).
        if (!db.objectStoreNames.contains(STORES.PUNCH)) {
          db.createObjectStore(STORES.PUNCH, { keyPath: 'clientUuid' });
        }
        // inventaire-queue : clé = inventaire + ligne. Recompter deux fois le
        // même produit avant de retrouver le réseau ne doit pas empiler deux
        // saisies : seule la dernière quantité comptée a un sens.
        if (!db.objectStoreNames.contains(STORES.INVENTAIRE)) {
          db.createObjectStore(STORES.INVENTAIRE, { keyPath: 'cle' });
        }
      };
      request.onsuccess = () => {
        clearTimeout(blockedTimer);
        const db = request.result;
        // Une version plus récente de l'app demande la base (autre onglet
        // mis à jour) : on la relâche tout de suite pour ne pas la bloquer,
        // la prochaine opération rouvrira.
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      request.onerror = () => { clearTimeout(blockedTimer); reject(request.error); };
    });
    // Échec d'ouverture (mode privé restrictif...) : on retentera au prochain appel.
    dbPromise.catch(() => { dbPromise = null; });
  }
  return dbPromise;
}

// Exécute `fn(store)` dans une transaction et résout une fois celle-ci committée
// (pas seulement la requête : garantit la persistance avant de continuer).
export async function withStore(storeName, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    let result;
    try {
      const request = fn(tx.objectStore(storeName));
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
