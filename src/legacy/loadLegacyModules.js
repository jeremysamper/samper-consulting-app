import {
  setHydrateFromSupabase,
  setLegacyStorageBridge,
  writeLegacyGlobal
} from './legacyApi.js';

let loadingPromise = null;

export async function loadLegacyModules() {
  if (typeof window === 'undefined') return {};
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const [
      legacyData,
      sopTemplates,
      legacySupabase
    ] = await Promise.all([
      import('../data/legacyData.js'),
      import('../data/sopTemplates.js'),
      import('../services/legacySupabase.js')
    ]);

    const {
      DEMO_DATA,
      hydrateFromSupabase,
      scRead,
      scResetAllData,
      scWrite,
      useSupabaseList
    } = legacyData;
    const { SOP_TEMPLATES } = sopTemplates;
    const { installLegacySupabase } = legacySupabase;

    installLegacySupabase();

    writeLegacyGlobal('DEMO_DATA', DEMO_DATA);
    setLegacyStorageBridge({ read: scRead, write: scWrite });
    writeLegacyGlobal('scResetAllData', scResetAllData);
    setHydrateFromSupabase(hydrateFromSupabase);
    writeLegacyGlobal('useSupabaseList', useSupabaseList);

    writeLegacyGlobal('SOP_TEMPLATES', SOP_TEMPLATES);

    return {};
  })();

  return loadingPromise;
}
