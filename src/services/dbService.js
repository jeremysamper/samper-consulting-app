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

  getRealtime() {
    return getLegacySB()?.realtime || null;
  },

  hasDatabase() {
    return Boolean(this.getDb());
  },
};
