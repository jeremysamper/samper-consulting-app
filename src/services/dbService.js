import { getLegacySB } from '../legacy/legacyApi.js';

// Transitional database facade.
// Modules import this service instead of reading the legacy window bridge directly.
export const dbService = {
  getBridge() {
    return getLegacySB();
  },

  getDb() {
    return getLegacySB()?.db || null;
  },

  // Client Supabase brut (query builder .from/.rpc/.storage…).
  // À utiliser quand un module a besoin de requêtes directes que le bridge
  // nommé getDb() n'expose pas. getDb() renvoie l'objet à méthodes nommées
  // (getRecettes, getShifts…) et n'a PAS de .from().
  getClient() {
    return getLegacySB()?.client || null;
  },

  getRealtime() {
    return getLegacySB()?.realtime || null;
  },

  hasDatabase() {
    return Boolean(this.getDb());
  },
};
