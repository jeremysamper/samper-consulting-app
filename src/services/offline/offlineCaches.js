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
// La file de punches (IndexedDB) n'est volontairement PAS purgée ici :
// les punches non synchronisés d'un utilisateur repartent à sa prochaine
// session (jamais perdus, jamais rejoués sous un autre compte : le rejeu
// filtre sur l'utilisateur de la session et la RPC re-vérifie côté base).
// ─────────────────────────────────────────────────────────────

const ETAB_SCOPED_CACHES = ['sb-recettes', 'sb-shifts', 'sb-photos', 'supabase-cache'];
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
