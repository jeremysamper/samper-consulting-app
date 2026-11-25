import { supabase } from './supabase.js';

// ─────────────────────────────────────────────────────────────────────────────
// Formats de vente des boissons (table plat_formats, migration
// 20261122_carte_boissons_formats). Lecture et écriture : l'équipe de
// l'établissement (RLS calquée sur plats) ; l'établissement d'un format est
// recopié du plat par la base. La Carte des boissons écrit, la Caisse lit.
// ─────────────────────────────────────────────────────────────────────────────

function message(error, fallback) {
  if (!error) return null;
  console.error('[formatsService]', error);
  if (error.code === '23505') return 'Deux formats portent le même nom. Changez-en un.';
  if (error.code === '23514') return 'Un format a un nom trop long ou un prix nul.';
  if (error.code === '42501') return "Vous n'avez pas les droits pour cette action.";
  return fallback || "Les formats n'ont pas été enregistrés. Réessayez.";
}

// Tous les formats de l'établissement, rangés par plat, ordre puis libellé.
export async function listFormats(etablissementId) {
  const { data, error } = await supabase
    .from('plat_formats')
    .select('id, plat_id, libelle, prix, ordre')
    .eq('etablissement_id', etablissementId)
    .order('plat_id', { ascending: true })
    .order('ordre', { ascending: true })
    .order('libelle', { ascending: true });
  if (error) return { data: null, error: message(error, 'Les formats des boissons ne se sont pas chargés.') };
  return { data: data || [], error: null };
}

// Remplace les formats d'une boisson par `formats` (validés par
// validerFormats) : retraits d'abord, puis mises à jour, puis ajouts, pour
// qu'un libellé repris par un autre format ne heurte pas l'index unique.
export async function enregistrerFormats({ platId, etablissementId, formats, avant = [] }) {
  const gardes = new Set(formats.filter((f) => f.id).map((f) => f.id));
  const retires = avant.filter((f) => f.id && !gardes.has(f.id)).map((f) => f.id);
  if (retires.length) {
    const { error } = await supabase.from('plat_formats').delete().in('id', retires);
    if (error) return { error: message(error) };
  }
  for (const f of formats.filter((x) => x.id)) {
    const ancien = avant.find((a) => a.id === f.id);
    if (ancien && ancien.libelle === f.libelle && Number(ancien.prix) === f.prix && Number(ancien.ordre) === f.ordre) continue;
    const { error } = await supabase.from('plat_formats')
      .update({ libelle: f.libelle, prix: f.prix, ordre: f.ordre })
      .eq('id', f.id);
    if (error) return { error: message(error) };
  }
  // L'établissement est envoyé pour la forme : la base le recopie du plat.
  const neufs = formats.filter((f) => !f.id)
    .map((f) => ({ plat_id: platId, etablissement_id: etablissementId, libelle: f.libelle, prix: f.prix, ordre: f.ordre }));
  if (neufs.length) {
    const { error } = await supabase.from('plat_formats').insert(neufs);
    if (error) return { error: message(error) };
  }
  return { error: null };
}
