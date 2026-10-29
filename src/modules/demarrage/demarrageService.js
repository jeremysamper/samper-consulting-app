import { supabase } from '../../services/supabase.js';

// ─────────────────────────────────────────────────────────────────────────────
// Mise en route d'un établissement (lot LD) : accès aux deux tables de la
// migration 20261030_demarrage.
//
//   demarrage_etapes   une ligne par étape faite, plus « termine » qui retire
//                      la carte du tableau de bord (posée pour tous les
//                      établissements en service par la migration)
//   donnees_exemple    le registre des lignes d'exemple (recettes, carte,
//                      produits) : l'effacement ne passe que par ces ids
//
// RLS : consultant et patron de l'établissement seulement. Les autres rôles
// lisent zéro ligne, sans erreur : la carte reste cachée.
//
// Étapes 2 à 4 (recettes, catalogue, planning) : constatées dans les données
// (une recette ou un produit hors exemple, un horaire), puis inscrites, pour
// qu'une étape faite le reste. Quand les étapes 1 à 4 sont faites et qu'aucun
// exemple n'est chargé, la ligne « termine » est écrite. Un exemple encore
// chargé la retient : la page de mise en route est le seul endroit d'où il
// s'efface en un geste.
// ─────────────────────────────────────────────────────────────────────────────

export const ETAPES = ['etablissement', 'recettes', 'catalogue', 'planning', 'exemple'];
const ETAPES_REQUISES = ['etablissement', 'recettes', 'catalogue', 'planning'];

async function idsDe(table, etabId) {
  const { data, error } = await supabase.from(table).select('id').eq('etablissement_id', etabId);
  if (error) throw error;
  return (data || []).map((r) => r.id);
}

export async function lireRegistre(etabId) {
  const { data, error } = await supabase
    .from('donnees_exemple')
    .select('table_cible, ligne_id')
    .eq('etablissement_id', etabId);
  if (error) throw error;
  return data || [];
}

export async function inscrireRegistre(etabId, lignes) {
  if (!lignes.length) return;
  const { error } = await supabase
    .from('donnees_exemple')
    .upsert(lignes.map((l) => ({ etablissement_id: etabId, table_cible: l.table, ligne_id: l.id })), { onConflict: 'table_cible,ligne_id' });
  if (error) throw error;
}

// Renvoie les ids réellement retirés du registre (la RLS refuse sans erreur).
export async function retirerRegistre(etabId, table, ids) {
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from('donnees_exemple')
    .delete()
    .eq('etablissement_id', etabId)
    .eq('table_cible', table)
    .in('ligne_id', ids)
    .select('ligne_id');
  if (error) throw error;
  return (data || []).map((r) => r.ligne_id);
}

export async function marquerEtapes(etabId, etapes) {
  if (!etapes.length) return;
  const { error } = await supabase
    .from('demarrage_etapes')
    .upsert(etapes.map((etape) => ({ etablissement_id: etabId, etape })), { onConflict: 'etablissement_id,etape' });
  if (error) throw error;
}

async function etapesInscrites(etabId) {
  const { data, error } = await supabase.from('demarrage_etapes').select('etape').eq('etablissement_id', etabId);
  if (error) throw error;
  return new Set((data || []).map((r) => r.etape));
}

async function aUnHoraire(etabId) {
  const { count, error } = await supabase
    .from('shifts')
    .select('id', { count: 'exact', head: true })
    .eq('etablissement_id', etabId);
  if (error) throw error;
  return (count || 0) > 0;
}

// État de la mise en route. Un établissement terminé ne coûte qu'une lecture.
// Toute erreur remonte : l'appelant cache la carte (jamais montrée par défaut).
export async function lireMiseEnRoute(etabId) {
  const inscrites = await etapesInscrites(etabId);
  if (inscrites.has('termine')) return { termine: true, faites: inscrites, registre: [] };

  const registre = await lireRegistre(etabId);
  const exemples = new Set(registre.map((l) => l.ligne_id));
  const horsExemple = (ids) => ids.some((id) => !exemples.has(id));
  const [recettes, produits, horaire] = await Promise.all([
    idsDe('recettes', etabId), idsDe('produits', etabId), aUnHoraire(etabId),
  ]);

  const constatees = [
    horsExemple(recettes) && 'recettes',
    horsExemple(produits) && 'catalogue',
    horaire && 'planning',
  ].filter((e) => e && !inscrites.has(e));
  const faites = new Set([...inscrites, ...constatees]);
  const termine = ETAPES_REQUISES.every((e) => faites.has(e)) && registre.length === 0;
  await marquerEtapes(etabId, [...constatees, ...(termine ? ['termine'] : [])]);
  if (termine) faites.add('termine');
  return { termine, faites, registre };
}
