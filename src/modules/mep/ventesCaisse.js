// Lecture des ventes de la Caisse native pour la « Mise en place de demain ».
// Le client Supabase est passé en argument (testable par node --test). La
// lecture ne prend que des quantités par plat et par jour : les tickets
// encaissés et numérotés, hors mode test, dont le jour d'exploitation tombe
// dans la fenêtre. Une page en échec fait échouer toute la lecture.

import { toutesLesPages } from '../../utils/lirePages.js';

export const SELECT_LIGNES_CAISSE = 'id, plat_id, quantite, caisse_tickets!inner(jour_exploitation)';

export async function lireVentesCaisse(client, etablissementId, debut, fin) {
  const l = await toutesLesPages((de, a) => client
    .from('caisse_lignes')
    .select(SELECT_LIGNES_CAISSE)
    .eq('caisse_tickets.etablissement_id', etablissementId)
    .eq('caisse_tickets.test', false)
    .not('caisse_tickets.numero', 'is', null)
    .eq('caisse_tickets.statut', 'encaisse')
    .gte('caisse_tickets.jour_exploitation', debut)
    .lte('caisse_tickets.jour_exploitation', fin)
    .order('id')
    .range(de, a));
  if (l.error) return { data: null, error: l.error };
  const lignes = (l.data || [])
    .map((r) => ({ jour: r.caisse_tickets?.jour_exploitation || null, platId: r.plat_id ?? null, qty: Number(r.quantite) }))
    .filter((r) => r.jour);
  if (!lignes.length) return { data: { lignes: [], plats: [], recettes: [] }, error: null };

  const [p, r] = await Promise.all([
    toutesLesPages((de, a) => client
      .from('plats')
      .select('id, nom, plat_recettes(recette_id)')
      .eq('etablissement_id', etablissementId)
      .order('id')
      .range(de, a)),
    toutesLesPages((de, a) => client
      .from('recettes')
      .select('id, nom')
      .eq('etablissement_id', etablissementId)
      .order('id')
      .range(de, a)),
  ]);
  if (p.error) return { data: null, error: p.error };
  if (r.error) return { data: null, error: r.error };
  const plats = (p.data || []).map((x) => ({
    id: x.id,
    nom: x.nom,
    recetteIds: (Array.isArray(x.plat_recettes) ? x.plat_recettes : []).map((pr) => pr.recette_id).filter(Boolean),
  }));
  const recettes = (r.data || []).map((x) => ({ id: x.id, nom: x.nom }));
  return { data: { lignes, plats, recettes }, error: null };
}
