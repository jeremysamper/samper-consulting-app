// ─────────────────────────────────────────────────────────────
// Purge des caches SW de données (Cache Storage).
//
// Défense en profondeur : les clés de cache sont des URL PostgREST
// complètes qui portent le filtre etablissement_id, il ne peut donc pas
// y avoir de service cross-tenant depuis le cache. On purge quand même :
//   * au changement d'établissement : caches scopés établissement ;
//   * au logout : tout, y compris profil/permissions (sb-boot), pour
//     qu'un autre utilisateur du même appareil ne relise rien.
//
// Les files IndexedDB (punches, saisies d'inventaire) ne sont volontairement
// PAS purgées ici : les écritures non synchronisées d'un utilisateur repartent
// à sa prochaine session (jamais perdues, jamais rejouées sous un autre compte :
// le rejeu filtre sur l'utilisateur de la session et la RPC re-vérifie côté
// base). Purger au logout ferait perdre un inventaire compté en chambre froide
// par quelqu'un qui se déconnecte avant d'avoir retrouvé du réseau.
// ─────────────────────────────────────────────────────────────

const ETAB_SCOPED_CACHES = ['sb-recettes', 'sb-shifts', 'sb-inventaires', 'sb-photos', 'supabase-cache'];
const ALL_DATA_CACHES = [...ETAB_SCOPED_CACHES, 'sb-boot'];

async function purge(names) {
  if (typeof caches === 'undefined') return;
  await Promise.all(names.map((name) => caches.delete(name).catch(() => false)));
}

export function purgeEtabDataCaches() {
  return purge(ETAB_SCOPED_CACHES);
}

export function purgeAllDataCaches() {
  return purge(ALL_DATA_CACHES);
}
