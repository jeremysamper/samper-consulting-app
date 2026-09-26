// ─────────────────────────────────────────────────────────────
// File d'attente des quantités comptées hors-ligne : stockage IndexedDB.
//
// Chaque élément est une quantité relevée sur une ligne d'inventaire :
//   { cle, clientUuid, inventaireId, ligneId, produit, unite, stockReel,
//     compteLe (ISO UTC), userId, etablissementId, createdAt (ms), attempts }
//
// Deux clés, deux rôles distincts :
//   * `cle` = <inventaireId>::<ligneId> est la clé de la boutique. Recompter
//     le même produit avant de retrouver le réseau REMPLACE la saisie en
//     attente : seule la dernière quantité comptée a un sens, et le compteur
//     affiché à l'utilisateur reste « nombre de produits en attente ».
//   * `clientUuid` est régénéré à chaque nouveau comptage et sert
//     d'idempotence côté base (PK de inventaire_saisies_offline) : un rejeu
//     répété n'écrit jamais deux fois.
//
// `compteLe` est l'heure du GESTE, jamais celle de la synchronisation :
// c'est elle qui arbitre les conflits côté serveur (le comptage le plus
// récent gagne, quel que soit l'ordre d'arrivée).
// ─────────────────────────────────────────────────────────────

import { STORES, withStore } from './offlineDb.js';

export const cleSaisie = (inventaireId, ligneId) => `${inventaireId}::${ligneId}`;

export const inventaireQueue = {
  // put sert à l'ajout, au remplacement (recomptage) et à la mise à jour
  // du compteur de tentatives.
  put(item) {
    return withStore(STORES.INVENTAIRE, 'readwrite', (store) => store.put(item));
  },

  // Retrait APRÈS rejeu réussi, uniquement si la saisie n'a pas été refaite
  // entre-temps : sans cette garde, une quantité recomptée pendant l'envoi de
  // la précédente serait supprimée de la file sans avoir jamais été transmise.
  async removeIfUnchanged(cle, clientUuid) {
    const db = await withStore(STORES.INVENTAIRE, 'readonly', (store) => store.get(cle));
    if (!db || db.clientUuid !== clientUuid) return false;
    await withStore(STORES.INVENTAIRE, 'readwrite', (store) => store.delete(cle));
    return true;
  },

  remove(cle) {
    return withStore(STORES.INVENTAIRE, 'readwrite', (store) => store.delete(cle));
  },

  async list() {
    const items = await withStore(STORES.INVENTAIRE, 'readonly', (store) => store.getAll());
    return items || [];
  },

  async count() {
    const n = await withStore(STORES.INVENTAIRE, 'readonly', (store) => store.count());
    return n || 0;
  },
};
