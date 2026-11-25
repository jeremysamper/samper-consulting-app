// ─────────────────────────────────────────────────────────────────────────────
// Lecture stricte des réglages d'un établissement, pour la reprise (lot 02 du
// panel). Elle ne passe pas par les caches des crochets : la source et
// l'établissement affiché sont lus tels qu'ils sont en base, sous la RLS.
//
// Rend { ok: true, fermetures, pointage, objectifs, modules } (blocs bruts,
// null quand la ligne n'existe pas) ou { ok: false } dès qu'une requête est en
// erreur : une lecture en échec n'est jamais prise pour une ligne absente.
//
// Le client est passé par l'appelant (la section passe `supabase`, le test un
// faux client) : ce fichier n'importe pas services/supabase.js.
// ─────────────────────────────────────────────────────────────────────────────

export async function lireReglagesEtab(client, etabId, { avecObjectifs = false, modules = [] } = {}) {
  if (!client || !etabId) return { ok: false };
  const liste = [...new Set((modules || []).filter(Boolean))];
  try {
    const [maison, objectifs, lignesModules] = await Promise.all([
      client.from('reglages_maison').select('fermetures, pointage').eq('etablissement_id', etabId).maybeSingle(),
      avecObjectifs
        ? client.from('objectifs_maison').select('objectifs').eq('etablissement_id', etabId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      liste.length
        ? client.from('reglages_modules').select('module, config').eq('etablissement_id', etabId).in('module', liste)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (!maison || !objectifs || !lignesModules || maison.error || objectifs.error || lignesModules.error) {
      console.error('[reprise] lecture', etabId, maison?.error || objectifs?.error || lignesModules?.error);
      return { ok: false };
    }
    const parModule = {};
    liste.forEach((m) => { parModule[m] = null; });
    (Array.isArray(lignesModules.data) ? lignesModules.data : []).forEach((l) => {
      if (l && liste.includes(l.module)) parModule[l.module] = l.config ?? null;
    });
    return {
      ok: true,
      fermetures: maison.data?.fermetures ?? null,
      pointage: maison.data?.pointage ?? null,
      objectifs: avecObjectifs ? (objectifs.data?.objectifs ?? null) : null,
      modules: parModule,
    };
  } catch (e) {
    console.error('[reprise] lecture', etabId, e);
    return { ok: false };
  }
}
